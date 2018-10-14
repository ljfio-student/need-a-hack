const request = require('request');
const { URL, URLSearchParams } = require('url');

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
    Client.sendSenderAction(webhook_event.sender, 'mark_seen');
    Client.sendSenderAction(webhook_event.sender, 'typing_on');

    let collection = database.collection(mongodbCollectionName);

    collection.findOne({ user: webhook_event.sender.id }, (err, result) => {
        if (err) {
            console.error(err);
            return;
        }

        if (result == null) {
            result = {
                user: webhook_event.sender.id,
                stage: ConversationStage.START,
                page: 1,
            };
        }

        switch (result.stage) {
            case ConversationStage.START:
                Client.sendText(webhook_event.sender, 'Do you know what kind of challenges are available?');
                result.stage = ConversationStage.CHALLENGE;
                break;
            case ConversationStage.CHALLENGE:
                result.challenge = webhook_event.message.text;
                Client.sendText(webhook_event.sender, 'What skills do you have in the team?');
                result.stage = ConversationStage.TECH;
                break;
            case ConversationStage.TECH:
                result.tech = webhook_event.message.text;

                if (webhook_event.message.quick_reply) {
                    let reply = webhook_event.message.quick_reply.payload;

                    if (reply == 'QR_YES') {
                        Client.sendText(webhook_event.sender, 'Great, happy hacking!')
                        result.stage = ConversationStage.START;
                        result.page = 1;
                    } else if (reply == 'QR_NO') {
                        Client.sendText(webhook_event.sender, 'Sorry we couldn\'t help');
                        result.stage = ConversationStage.START;
                        result.page = 1;
                    } else if (reply == 'QR_SHOW_MORE') {
                        result.page++;
                        queryDevpost(webhook_event.sender, result);
                    }
                } else {
                    queryDevpost(webhook_event.sender, result);
                }

                break;
        }

        collection.update({ user: result.user }, result, { upsert: true }, (err) => {
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

function queryDevpost(sender, conversation) {
    devpost_url = buildUrl(conversation.challenge, 0, conversation.page);

    request({
        url: devpost_url,
        json: true,
    }, (error, response, data) => {
        if (error) {
            console.error(error);
            Client.sendText(sender, 'Sorry bro, couldn\'t find anything');
            Client.sendSenderAction(sender, 'typing_off');
            return;
        }

        if (data.software && data.software.length > 0) {
            let list = [];

            for (let software of data.software) {
                let item = {
                    title: software.name,
                    subtitle: software.tagline,
                    default_action: {
                        type: 'web_url',
                        url: software.url,
                        messenger_extensions: false,
                        webview_height_ratio: 'tall'
                    }
                };

                list.push(item);
            }

            let template = {
                template_type: 'list',
                top_element_style: 'compact',
                elements: list,
                buttons: [
                    {
                        type: 'postback',
                        title: 'Show More',
                        payload: 'QR_SHOW_MORE',
                    }
                ]
            };

            if (conversation.page == 1) {
                Client.sendText(sender, 'Here are some projects within your challenge area which utilise those skills:');
            }

            Client.sendTemplate(sender, template)
                .then(res => {
                    console.log(res);
                })
                .catch(e => {
                    console.error(e);
                });

            setTimeout(() => {
                Client.sendQuickReplies(sender, [
                    {
                        content_type: 'text',
                        title: 'Yes',
                        payload: 'QR_YES',
                    },
                    {
                        content_type: 'text',
                        title: 'No',
                        payload: 'QR_NO',
                    },
                    {
                        content_type: 'text',
                        title: 'Show me more...',
                        payload: 'QR_SHOW_MORE',
                    }
                ], 'Does this meet your requirements?')
            }, 2000);
        }

        Client.sendSenderAction(sender, 'typing_off');
    });
}

function buildUrl(message, type, page) {
    let options = ['is:popular', 'is:featured', 'is:trending'];

    let components = message.split(' ');

    components.unshift(options[type ? type : 0]);

    let combined = components.join(' ');

    // Create the HREF
    let search_url = new URL('https://devpost.com/software/search');
    let search_params = new URLSearchParams();

    search_params.set('query', combined);
    search_params.set('per_page', '4');

    if (page != 1) {
        search_params.set('page', page);
    }

    search_url.search = search_params;

    console.log(search_url.href);

    return search_url.href;
}