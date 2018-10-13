const Messenger = require('messenger-node');
const config = require('./config.json');

const request = require('request');

const Webhook = new Messenger.Webhook(config.webhook);
const Client = new Messenger.Client(config.client);

Webhook.on('messages', (event_type, sender_info, webhook_event) => {
    let query = encodeURIComponent(webhook_event.message.text);
    let url = "https://devpost.com/software/popular?query=" + query + "&per_page=4";

    request({
        url: url,
        json: true,
    }, (error, response, data) => {
        if (error) {
            console.error(error);
            Client.sendText(webhook_event.sender, "Sorry bro, couldn't find anything");
        }

        if (data.software && data.software.length > 0) {
            let list = [];

            for (let software of data.software) {
                let item = {
                    title: software.name,
                    subtitle: software.tagline,
                    default_action: {
                        type: "web_url",
                        url: software.url,
                        messenger_extensions: false,
                        webview_height_ratio: "tall"
                    }
                };

                list.push(item);
            }

            let template = {
                template_type: "list",
                top_element_style: "compact",
                elements: list,
            };

            Client.sendTemplate(webhook_event.sender, template)
                .then(res => {
                    console.log(res);
                })
                .catch(e => {
                    console.error(e);
                });
        }
    });
});