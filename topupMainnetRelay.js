import fs from "fs";
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ethers, JsonRpcProvider, FetchRequest, formatUnits } from "ethers";

import { logger } from './logger/logger.js';
import { Binance } from './src/apps/binance.js';
import { Relay } from './src/apps/relay.js';
import { TelegramBot } from "./src/apps/telegram.js";
import { shuffleArray, sleep, randInt, randFloat, randomChoice, randFloatWithDec, roundToAppropriateDecimalPlace } from './src/helpers/basic.js';
import { rpcs, binanceNetworkNames } from './src/helpers/constants.js';
import { config } from './config.js';


const addressFromPrivateKey = (privateKey) => {
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
};


const generateProviderAndSigner = (secret, proxy, rpc) => {
    let provider;

    if (proxy) {
        const fetchRequest = new FetchRequest(rpc);
        fetchRequest.getUrlFunc = FetchRequest.createGetUrlFunc({agent: new HttpsProxyAgent(proxy)});
        provider = new JsonRpcProvider(fetchRequest);
    } else {
        provider = new JsonRpcProvider(rpc);
    }

    const signer = new ethers.Wallet(secret, provider);
    return [ provider, signer ];
};


const waitForGas = async () => {
    // waiting for gas without proxy, default provider
    const mainnetProvider = new JsonRpcProvider(rpcs.ethereum);
    let currentMaxGas = config.gasPrices.startMainnetGwei;

    const timestampShift = config.gasPrices.delayMinutes * 60 * 1000 // minutes to miliseconds
    let nextCurrentMaxGasIncrease = Date.now() + timestampShift;

    logger.info(`Waiting for gas...`);
    while(true) {
        if ((Date.now() >= nextCurrentMaxGasIncrease) && (config.gasPrices.step !== 0) && (currentMaxGas < config.gasPrices.maxMainnetGwei)) {
            logger.info(`Increasing max gas ${currentMaxGas} -> ${currentMaxGas + config.gasPrices.step} GWEI`);
            currentMaxGas = currentMaxGas + config.gasPrices.step;
            nextCurrentMaxGasIncrease = Date.now() + timestampShift;
        }
        
        const feeData = await mainnetProvider.getFeeData();
        const gasPriceGwei = parseFloat(formatUnits(feeData.gasPrice.toString(), "gwei"));

        if (gasPriceGwei <= currentMaxGas) {
            logger.debug(`current gas is ${gasPriceGwei.toFixed(1)}, my current max is ${currentMaxGas}`);
            logger.info(`gas ok, proceeding`);
            return;
        } else {
            logger.debug(`current gas is ${gasPriceGwei.toFixed(1)}, my current max is ${currentMaxGas}, waiting...`);
            await sleep(randInt(30, 60));
        }
    }
};


const waitForBalanceChange = async (initialBalanceWei, provider, address) => {
    logger.debug(`Waiting for balance increase...`)
    const start = Date.now();
    while (true) {
        if ((Date.now() - start) > config.deadlineForWaitingBalanceIncreaseSec * 1000) {
            throw Error(`Deadline for balance increase wait was reached`);
        }

        const newBalanceWei = await provider.getBalance(address);
        if (newBalanceWei !== initialBalanceWei) {
            logger.debug(`${initialBalanceWei} WEI -> ${newBalanceWei} WEI`);
            return;
        } else {
            await sleep(5);
        }
    }
};


const updateTxtFiles = async(failedWallets, successWallets, remainingWallets) => {
	const failedWalletsContent = failedWallets.join('\n');
	const successWalletsContent = successWallets.join('\n');
	const remainingWalletsContent = remainingWallets.join('\n');

	fs.writeFileSync('failedWallets.txt', failedWalletsContent, 'utf8');
	fs.writeFileSync('successWallets.txt', successWalletsContent, 'utf8');
	fs.writeFileSync('walletsData.txt', remainingWalletsContent, 'utf8');
};


const start = async () => {
    const binance = new Binance(config.binanceAuth);
    const tgBot = new TelegramBot(config.telegramData.botToken, config.telegramData.chatIds);

    let walletsData = fs.readFileSync("walletsData.txt", 'utf8').toString().replace(/\r\n/g, '\n').split('\n').filter(n => n);

    const failedWallets = [];
	const successWallets = [];
	const remainingWallets = [...walletsData];

    if (config.shuffleWallets) {
        walletsData = shuffleArray(walletsData);
    }

    for (const walletData of walletsData) {
        const [ name, privateKey, proxy ] = walletData.split("|");

        try {
            const address = addressFromPrivateKey(privateKey);
            const topupChainName = randomChoice(config.topupChains);
            const outChainName = topupChainName;
            const [ outProvider, outSigner ] = generateProviderAndSigner(privateKey, proxy, rpcs[outChainName]);
            const [ inProvider, inSigner ] = generateProviderAndSigner(privateKey, proxy, rpcs.ethereum);
    
            const topupAmountEth = randFloatWithDec(
                config.cexWithdrawAmountsEth.minAmount,
                config.cexWithdrawAmountsEth.maxAmount,
                config.cexWithdrawAmountsEth.minDecimals,
                config.cexWithdrawAmountsEth.maxDecimals,
            );
    
            const bridgeShare = randFloat(config.bridgeShareConfig.min, config.bridgeShareConfig.max);
            const bridgeAmountEthSybil = topupAmountEth * bridgeShare;
            const bridgeAmountEth = roundToAppropriateDecimalPlace(bridgeAmountEthSybil, config.bridgeShareConfig.minDec, config.bridgeShareConfig.maxDec);

            if (config.waitForGasForCexTopup) {
                await waitForGas();
            }

            const balanceBeforeTopup = await outProvider.getBalance(address);
            logger.debug(`${name} - balance before cex topup: ${balanceBeforeTopup} WEI`);

            logger.info(`${name} - topping up wallet, address: ${address}, chain: ${topupChainName}, amount: ${topupAmountEth} ETH`);
            const wdid = await binance.withdraw(address, "ETH", binanceNetworkNames[topupChainName], topupAmountEth);
            logger.info(`${name} - successfully withdrawed ETH from CEX, wdid: ${wdid}`);
            
            await waitForBalanceChange(balanceBeforeTopup, outProvider, address);
            logger.info(`${name} - wallet received ETH`);

            const delayAfterCex = randInt(config.delays.minDelayAfterCexWithdrawSec, config.delays.maxDelayAfterCexWithdrawSec);
            logger.info(`${name} - sleeping ${(delayAfterCex / 60).toFixed(2)} minutes...`);
            await sleep(delayAfterCex);

            const relay = new Relay(
                outProvider,
                outSigner,
                outChainName,
                'ethereum',
                proxy
            );

            await waitForGas();

            const balanceBeforeRelay = await inProvider.getBalance(address);
            logger.debug(`${name} - balance before relay: ${balanceBeforeRelay} WEI`);

            logger.info(`${name} - relaying ${bridgeAmountEth} ETH to mainnet`);
            const hash = await relay.performEthRelay(bridgeAmountEth, config.maxRelayerFeeEth);
            logger.info(`${name} - successfully sent relay tx, hash: ${hash}`);

            await waitForBalanceChange(balanceBeforeRelay, inProvider, address);
            logger.info(`${name} - mainnet topped up`);

            const tgMessage = `✅ Wallet: #${name}\n\n#Successfully topped up ${bridgeAmountEth} ETH`;
            await tgBot.notifyAll(tgMessage);

            successWallets.push(walletData);
        } catch (e) {
            logger.error(`${name} - failed to topup mainnet, reason: ${e.message}`);

            const tgMessage = `⛔️ Wallet: #${name}\n\n#Failed to topup, reason: ${e.message}`
            await tgBot.notifyAll(tgMessage);

            failedWallets.push(walletData);
        } finally {
            const walletDataIndex = remainingWallets.indexOf(walletData);
            if (walletDataIndex !== -1) {
                remainingWallets.splice(walletDataIndex, 1);
            }

            updateTxtFiles(failedWallets, successWallets, remainingWallets);

            const delayBeforeNextSec = randInt(config.delays.minDelayBetweenAccsSec, config.delays.maxDelayBetweenAccsSec);
            logger.info(`Sleeping ${(delayBeforeNextSec / 60).toFixed(2)} minutes...`);
            await sleep(delayBeforeNextSec);
        }
    }

};


start();
