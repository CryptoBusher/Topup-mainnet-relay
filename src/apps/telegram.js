import fetch from "node-fetch";
import { sleep } from "./../helpers/basic.js";


export class TelegramBot {
	constructor(botToken, chatIds) {
		this.botToken = botToken;
		this.chatIds = chatIds;
		this.sendMessageEndpoint = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
	}

	async sendNotification(message, chatId, threadId = null) {
        const headers = {
            'Content-Type': 'application/json'
        };

        const body = {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            disable_notification: false,
            disable_web_page_preview: true
        };

		if (threadId) {
			body.message_thread_id = threadId;
		};

		const settings = {
			method: 'POST',
			timeout: 5000,
			headers: headers,
			body: JSON.stringify(body)
		};

		const response = await fetch(this.sendMessageEndpoint, settings);

		if (response.status !== 200) {
			throw Error(`Failed to post TG message, reason: ${JSON.stringify(await response.json())})`);
		}

		const jsonResp = await response.json();
		
		if (!jsonResp.ok) {
			const chatFullData = threadId ? chatId + '/' + threadId : chatId;
			throw Error(`Failed to send notification to chat ${chatFullData}, reason: ${jsonResp.description}`);
		};
	}

	async notifyAll(message) {
		for (const chat of this.chatIds) {
			const [ chatId, threadId ] = chat.split('/');
			try {
				await this.sendNotification(message, chatId, threadId);
			} catch (e) {
				// console.log(e.message);
			}

			await sleep(1);
		}
	}
}
