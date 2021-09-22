const _ = require("lodash");
const {
	message: { textLimit },
} = require("../config");
const axios = require("axios");
const AbstractProvider = require(".");
const Setting = require("../models/setting");
const Paginator = require("../models/paginator");
const { keyboard, keypad } = require("../utils/bot-helper");

module.exports = class Movie extends AbstractProvider {
	constructor(bot) {
		super(bot);
		this.type = "movie";
		this.endpoint = process.env.GOPHIE_API;
	}

	/**
	 * List movies
	 * @param  {} message
	 * @param  {} page=1
	 */
	async list({ chat }, page = 1) {
		const { message_id } = await this.bot.sendMessage(
			chat.id,
			"\u{1F4E1} Fetching latest movies",
			keyboard
		);

		this.bot.sendChatAction(chat.id, "typing");
		const { data } = await axios.get(`${this.endpoint}/list`, {
			params: { page, engine: "fzmovies" },
		});

		if (data.length < 1) return this.emptyAPIResponse(chat.id, message_id);

		const pages = [],
			promises = [],
			pager = data.pop();

		_.map(data, movie => {
			const options = { parse_mode: "html" };
			options.reply_markup = JSON.stringify({
				inline_keyboard: [
					[
						{
							text: `${keypad.download} (${movie.Size})`,
							url: movie.DownloadLink,
						},
					],
				],
			});

			promises.push(
				this.bot
					.sendMessage(chat.id, this.getText(movie), options)
					.then(msg => {
						pages.push({
							insertOne: {
								document: {
									_id: msg.message_id,
									type: this.type,
									user: msg.chat.id,
								},
							},
						});
					})
			);
		});

		await Promise.all(promises);
		/*
		 * Ensure all messages are sent before pagination
		 */
		const pagination = [
			{
				text: keypad.next,
				callback_data: JSON.stringify({
					type: `page_ls_${this.type}`,
					page: page + 1,
				}),
			},
		];

		const settings = await Setting.findOne({ user: chat.id });
		if ((!settings || settings.purge_old_pages) && page > 1) {
			pagination.unshift({
				text: keypad.previous,
				callback_data: JSON.stringify({
					type: `page_ls_${this.type}`,
					page: page - 1,
				}),
			});
		}

		await this.bot
			.sendMessage(chat.id, this.getText(pager), {
				parse_mode: "html",
				reply_markup: JSON.stringify({
					inline_keyboard: [
						[
							{
								text: `${keypad.download} (${pager.Size})`,
								url: pager.DownloadLink,
							},
						],
						pagination,
					],
				}),
			})
			.then(msg => {
				pages.push({
					insertOne: {
						document: {
							_id: msg.message_id,
							type: this.type,
							user: msg.chat.id,
						},
					},
				});
			});

		await this.bot.deleteMessage(chat.id, message_id);
		if (!settings || settings.purge_old_pages) await Paginator.bulkWrite(pages);
	}

	/**
	 * Search for movies
	 * @param  {} message
	 * @param  {} params
	 */
	async search({ chat }, params) {
		const { message_id } = await this.bot.sendMessage(
			chat.id,
			`\u{1F4E1} Searching for _${params.query}_`,
			keyboard
		);

		this.bot.sendChatAction(chat.id, "typing");
		const { data } = await axios.get(`${this.endpoint}/search`, {
			params: {
				query: params.query.replace(" ", "+"),
				engine: "fzmovies",
			},
		});

		if (data.length < 1) {
			return this.emptyAPIResponse(chat.id, message_id, "No results found.");
		}

		_.map(data, async movie => {
			if (movie.Size && movie.CoverPhotoLink) {
				const options = { parse_mode: "html" };
				options.reply_markup = JSON.stringify({
					inline_keyboard: [
						[
							{
								text: `${keypad.download} (${movie.Size})`,
								url: movie.DownloadLink,
							},
						],
					],
				});

				await this.bot.sendMessage(chat.id, this.getText(movie), options);
			}
		});

		await this.bot.deleteMessage(chat.id, message_id);
	}

	/**
	 * Interactive search
	 * @param  {} message
	 */
	async interactiveSearch(message) {
		const chatId = message.chat.id;
		const { message_id } = await this.bot.sendMessage(
			chatId,
			"\u{1F50D} Tell me the title of the movie you want",
			{ reply_markup: JSON.stringify({ force_reply: true }) }
		);

		const listenerId = this.bot.onReplyToMessage(
			chatId,
			message_id,
			async reply => {
				this.bot.removeReplyListener(listenerId);
				await this.searchQueryValidator(reply, message);
			}
		);
	}

	/**
	 * @param  {} movie
	 */
	getText(movie) {
		let description = movie.Description;
		if (description) {
			if (description.length > textLimit)
				description = `\n\n<b>Description:</b> <em>${description.substr(
					0,
					textLimit
				)}...</em>`;
			else description = `\n\n<b>Description:</b> <em>${description}</em>`;
		} else description = "";

		return `<a href="${movie.CoverPhotoLink}">\u{1F3AC}</a> <b>${movie.Title}</b>${description}`;
	}
};
