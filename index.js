const request = require('request');

// MongoDB Database
const mongodbUrl = 'mongodb://localhost:27017';
const mongodbDbName = 'need-a-hack';
const mongodbCollectionName = 'conversations';

const MongoClient = require('mongodb').MongoClient;

const databaseClient = new MongoClient(mongodbUrl);
let database = null;

databaseClient.connect((err, client) => {
    if (err) throw err;

    database = client.db(mongodbDbName);
});

// Facebook Messenger
const Messenger = require('messenger-node');
const config = require('./config.json');

const Webhook = new Messenger.Webhook(config.webhook);
const Client = new Messenger.Client(config.client);

Webhook.on('messages', (event_type, sender_info, webhook_event) => {
    Client.sendSenderAction(webhook_event.sender, "mark_seen");
    Client.sendSenderAction(webhook_event.sender, "typing_on");

    let collection = database.collection(mongodbCollectionName);

    collection.findOne({user: webhook_event.sender.id}, (err, result) => {
        if (err) {
            console.error(err);
            return;
        }

        if (result == null) {
            result = {
                user: webhook_event.sender.id,
                stage: ConversationStage.START,
            };
        }

        switch (result.stage) {
            case ConversationStage.START:
                Client.sendText(webhook_event.sender, "Do you know what kind of challenges are available?");
                result.stage = ConversationStage.CHALLENGE;
                break;
            case ConversationStage.CHALLENGE:
                result.challenge = webhook_event.message.text;
                Client.sendText(webhook_event.sender, "What skills do you have in the team?");
                result.stage = ConversationStage.TECH;
                break;
            case ConversationStage.TECH:
                result.tech = webhook_event.message.text;
                queryDevpost(webhook_event.sender, result);
                result.stage = ConversationStage.START;
                break;
        }

        collection.update({user: result.user}, result, {upsert: true}, (err) => {
            if (err) {
                console.error(err);
                return;
            }

            console.log(result);
        });
    });
});

const ConversationStage = {
    START: 0,
    CHALLENGE: 1,
    TECH: 2,
};

function queryDevpost(sender, convertsation) {
    devpost_url = buildUrl(convertsation.challenge);

    request({
        url: devpost_url,
        json: true,
    }, (error, response, data) => {
        if (error) {
            console.error(error);
            Client.sendText(sender, "Sorry bro, couldn't find anything");
            Client.sendSenderAction(sender, "typing_off");
            return;
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

            Client.sendText(sender, "Here are some projects within your challenge area which utilise those skills:");

            Client.sendTemplate(sender, template)
                .then(res => {
                    console.log(res);
                })
                .catch(e => {
                    console.error(e);
                });
        }

        Client.sendSenderAction(sender, "typing_off");
    });
}

function buildUrl(message, type) {
    let options = ['is:popular', 'is:featured', 'is:trending'];

    let components = message.split(' ');

    components.unshift(options[type ? type : 0]);

    let combined = components.map(a => encodeURIComponent(a)).join('+');

    return "https://devpost.com/software/search?query=" + combined + "&per_page=4";
}