import ccxt from 'ccxt'
import { logger } from "./../../logger/logger.js";


export class Binance {
	constructor(binanceAuth) {
		this.binance = new ccxt.binance(binanceAuth);
		this.ethBalance = null;
	}

	debugLog(message) {
		logger.debug(`"binance"/${message}`);
	}

	async getWithdrawFee(coin, chain) {
		const fees = await this.binance.fetchDepositWithdrawFees([coin])
		// this.debugLog(`"getWithdrawFee" - fees: ${JSON.stringify(fees)}`);
		return await fees[coin].networks[chain].withdraw.fee;
	}

	async withdraw(address, coin, chain, amountReadable) {
		this.debugLog(`"withdraw" - address: ${address}, coin: ${coin}, chain: ${chain}, amount: ${amountReadable}`);

		if (chain === "LINEA") {
			throw Error('Linea is not supported by binance for withdrawal');
		}

		const fee = await this.getWithdrawFee(coin, chain);
		this.debugLog(`"withdraw" - fee: ${fee}`);

		const params = {
			network: chain
		};

		const response = await this.binance.withdraw(
			coin,
			amountReadable,
			address,
			null, // tag
			params
		);
		this.debugLog(`"withdraw" - response: ${JSON.stringify(response)}`);
		
		const wdid = await response.id;
		this.debugLog(`"withdraw" - wdid: ${wdid}`);

		if (wdid === undefined) {
			throw Error(`${JSON.stringify(response)}`);
		}

		return wdid;
	}
}
