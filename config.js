import 'dotenv/config';


export const config = {
    binanceAuth: {
		apiKey: process.env.BINANCE_API_KEY,
		secret: process.env.BINANCE_API_SECRET,
		enableRateLimit: false,
		options: {
			defaultType: "spot"
		}
	},

	telegramData: {	
		botToken: process.env.TG_BOT_TOKEN,
		chatIds: [
			process.env.TG_CHAT_ID,
		]
	},

    cexWithdrawAmountsEth: {
		minAmount: 0.005,
		maxAmount: 0.01,
		minDecimals: 4,
		maxDecimals: 7
	},

	bridgeShareConfig: {
		min: 0.90,
		max: 0.93,
		minDec: 2,
		maxDec: 5
	},

    topupChains: [
        'optimism', // min 0.002 ETH
        'arbitrum', // min 0.0008 ETH
        'zksync', // min 0.02 ETH
        'base' // min 0.001 ETH
    ], 

    gasPrices: {
		startMainnetGwei: 5,
		step: 1,
		delayMinutes: 2,
		maxMainnetGwei: 10
	},

	delays: {
		minDelayAfterCexWithdrawSec: 60,
		maxDelayAfterCexWithdrawSec: 300,
		minDelayBetweenAccsSec: 60,
		maxDelayBetweenAccsSec: 300,
	},

    shuffleWallets: true,
	waitForGasForCexTopup: false,
	maxRelayerFeeEth: 0.9/2900,
	deadlineForWaitingBalanceIncreaseSec: 600,
	showDebugLog: false
};
