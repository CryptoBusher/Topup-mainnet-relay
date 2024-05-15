// https://relay.link/

import { formatEther, parseEther } from "ethers";
import fetch from "node-fetch";
import { HttpsProxyAgent } from 'https-proxy-agent';

import { logger } from "./../../logger/logger.js";
import { chainIds } from "./../helpers/constants.js";
import { sleep, randInt } from "./../helpers/basic.js";


export class Relay {
    static RELAY_ADDRESS = '0xf70da97812cb96acdf810712aa562db8dfa3dbef';

    constructor(outProvider, outSigner, outChainName, inChainName, proxy) {
        this.outProvider = outProvider;
        this.outSigner = outSigner;
        this.outChainName = outChainName;
        this.inChainName = inChainName;
        this.proxy = proxy;
    }

    debugLog(message) {
		logger.debug(`"relay"/${message}`);
	}

    async sendOnchainTx (txData) {
        const tx = await this.outSigner.sendTransaction(txData);
        const receipt = await tx.wait();

        return await receipt.hash;
    }

    async performEthRelay (amountEth, maxRelayerFeeEth) {
        this.debugLog('performEthRelay - performing relay');
        const amountWei = parseEther(amountEth.toString());
        const outChainId = chainIds[this.outChainName];
        const inChainId = chainIds[this.inChainName];

        // safety check
        const providerNetworkInfo = await this.outProvider.getNetwork();
        const providerChainId = parseInt(providerNetworkInfo.chainId);
        if (providerChainId !== outChainId) {
            throw Error(`Provider chain id ${providerChainId}, out chain id ${outChainId}`);
        }

        const txDetails = await this.getTxDetails(amountWei, outChainId, inChainId, "eth");
        const txData = await txDetails.steps[0].items[0].data;
        const statusEndpoint = await txDetails.steps[0].items[0].check.endpoint;
        this.debugLog(`performEthRelay - ${JSON.stringify(txData)}`);

        // safety check
        if (txData.to.toLowerCase() !== Relay.RELAY_ADDRESS.toLowerCase()) {
            throw Error(`Unexpected relay address: ${txData.to}`);
        }

        const relayerFeeEth = parseFloat(formatEther(txDetails.fees.relayer));
        this.debugLog(`relayerFeeEth: ${relayerFeeEth}, maxRelayerFeeEth: ${maxRelayerFeeEth}`);
        if (relayerFeeEth > maxRelayerFeeEth) { 
            throw Error(`Relayer fee (${relayerFeeEth}) exceeds user limit (${maxRelayerFeeEth})`);
        }

        return await this.sendOnchainTx(txData);
    }

    async getTxDetails (amountWei, outChainId, inChainId, currencyName) {
        const url = 'https://api.relay.link/execute/bridge';

        const headers = {
            "content-type": "application/json",
        };

        const body = {
            user: this.outSigner.address,
            originChainId: outChainId,
            destinationChainId: inChainId,
            currency: currencyName,
            recipient: this.outSigner.address,
            amount: amountWei.toString(),
            usePermit: false,
            useExternalLiquidity: false,
            source: "relay.link"
        };

        const settings = {
            method: 'POST',
            timeout: 5000,
            headers: headers,
            body: JSON.stringify(body),
        };

        if (this.proxy) {
            const proxyAgent = new HttpsProxyAgent(this.proxy);
            settings.agent = proxyAgent;
        }

        for (let i = 0; i < 5; i++) {
            try {
                const response = await fetch(url, settings);
                if (response.status !== 200) {
                    throw Error(`Failed to get tx details from Relay API: ${JSON.stringify(await response.json())})`);
                }

                const data = await response.json();
                return data;
            } catch (e) {
                this.debugLog(e.message);
                await sleep(randInt(1, 5));
            }
        }

        throw Error(`Totally failed to get tx detaild from Relay API (check debug log for more info)`);
    }
}
