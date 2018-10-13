const Messenger = require('messenger-node');
const config = require('./config.json');

const Webhook = new Messenger.Webhook(config.webhook);
const Client = new Messenger.Client(config.client);

Webhook.on('messages', (event_type, sender_info, webhook_event) => {
    console.log(event_type);
    console.log(sender_info);
    console.log(webhook_event);


});