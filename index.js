const {
    Client,
    GatewayIntentBits,
    Partials
} = require('discord.js');
const {
    promises: fs,
    createWriteStream
} = require('fs');
const fetch = require('node-fetch');
const path = require('path');
const {
    format
} = require('date-fns');
require('dotenv').config();

const client = new Client({
    intents: Object.values(GatewayIntentBits),
    partials: Object.values(Partials),
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.username}`);

    const totalMessages = 200; // can range from 10 - 1000
    const channelId = process.env.channelId;
    const logDir = 'logs';
    const filesDir = path.join(logDir, 'files');

    try {
        await createDirectories([logDir, filesDir]);

        const channel = await fetchChannel(channelId);
        const messages = await fetchMessages(channel, totalMessages);
        const logContent = await formatMessages(messages, filesDir);

        await fs.writeFile(path.join(logDir, `${channel.name}.txt`), logContent.trim(), 'utf-8');
        console.log(`Messages and attachments logged from ${channel.name}. Total: ${messages.length}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
    } finally {
        client.destroy();
    }
});

/**
 * Create directories if they don't exist
 */
async function createDirectories(directories) {
    return Promise.all(directories.map(dir => fs.mkdir(dir, {
        recursive: true
    })));
}

/**
 * Fetch a specific channel by ID and validate it
 */
async function fetchChannel(channelId) {
    const channel = await client.channels.fetch(channelId);
    if (!channel.isTextBased()) {
        throw new Error(`Invalid text channel: ${channelId}`);
    }
    console.log(`Fetching and saving messages from ${channel.name}...`);
    return channel;
}

/**
 * Fetch a specific number of messages from the channel
 */
async function fetchMessages(channel, totalMessages) {
    const allMessages = [];
    let lastMessageId;

    while (allMessages.length < totalMessages) {
        const messages = await channel.messages.fetch({
            limit: Math.min(100, totalMessages - allMessages.length),
            before: lastMessageId
        });
        if (!messages.size) break;

        allMessages.push(...messages.values());
        lastMessageId = messages.last().id;
    }

    return allMessages;
}

/**
 * Format fetched messages, log content, and save attachments
 */
async function formatMessages(messages, filesDir) {
    const formatDate = date => format(date, 'MMMM dd, yyyy hh:mm:ss a');

    return (await Promise.all(messages.map(async (msg) => {
        let messageLog = `${msg.content}\n---- Sent By: ${msg.author.tag}\n--------- At: ${formatDate(msg.createdAt)}${msg.editedAt ? `\n-- Edited At: ${formatDate(msg.editedAt)}` : ''}`;

        if (msg.attachments.size > 0) {
            messageLog += `\nAttachments:\n${await saveAttachments(msg.attachments, filesDir)}`;
        }

        return messageLog;
    }))).join('\n\n');
}

/**
 * Save attachments locally, log URLs, and return log information
 */
async function saveAttachments(attachments, filesDir) {
    return (await Promise.all(attachments.map(async (attachment) => {
        const filePath = path.join(filesDir, attachment.name);

        try {
            const res = await fetch(attachment.url);
            const stream = createWriteStream(filePath);
            await new Promise((resolve, reject) => {
                res.body.pipe(stream);
                res.body.on('error', reject);
                stream.on('finish', resolve);
            });

            return `- URL: ${attachment.url}`;
        } catch (error) {
            return `- URL: ${attachment.url}\n  Failed to save: ${attachment.name} (${error.message})`;
        }
    }))).join('\n');
}

client.login(process.env.token);