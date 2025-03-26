require("dotenv").config();
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
TelegramBot.Promise = require("bluebird").config({
	cancellation: true,
});
const env = process.env;
const config = require("./config");
const command = require("./commands");
const handler = require("./handlers");

const bot = new TelegramBot(env.BOT_TOKEN, config.bot);

		console.info(`\u{1F41D} ${env.BOT_NAME} started successfully`);
}
}
starthelper();
