const Discord = require("discord.js");
const schedule = require("node-schedule");
const fetch = require("node-fetch");
const client = new Discord.Client();
require("dotenv").config();

const emojis = {
  terran: "444448298657513482",
  newcon: "231260160511705088",
  vanu: "231260169676390403",
  thumbsup: "👍", // for testing
};

const minPlayers = parseInt(process.env.BOT_MIN_PLAYERS, 10) || 20;
const oneHourMiliseconds = 3600000;
const channelId = process.env.BOT_CHANNEL_ID;

client.login(process.env.BOT_TOKEN);

client.on("ready", async () => {
  console.info(`logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(channelId);
  let serverStats = await fetchServerStats();
  let subscribers = [];
  let message = null;

  const embedMessages = (await channel.messages.fetch({ limit: 10 })).filter(
    (m) => m.author.id === client.user.id && m.embeds.length > 0
  );
  if (embedMessages.size > 0) {
    message = embedMessages.first();
    message = await message.edit(embed());
    await update();
  } else {
    message = await channel.send(embed());
  }
  await message.react(emojis.terran);
  await message.react(emojis.newcon);
  await message.react(emojis.vanu);

  function embed() {
    const newMessage = new Discord.MessageEmbed().setThumbnail(
      "https://psforever.net/index_files/logo_crop.png"
    );

    if (serverStats.status !== "UP") {
      return newMessage.setColor("#ff0000").setTitle("Server is Offline");
    }

    return newMessage
      .setColor("#0099ff")
      .setTitle("Server is Online")
      .setURL("https://play.psforever.net")
      .setDescription(
        `**Online Players: ${serverStats.players.length}** (${serverStats.empires.TR} <:terran:${emojis.terran}> ${serverStats.empires.NC} <:newcon:${emojis.newcon}> ${serverStats.empires.VS} <:vanu:${emojis.vanu}>)`
      )
      .addFields(
        {
          name: "How to play",
          value:
            "[PSForever setup guide](https://docs.google.com/document/d/1ZMx1NUylVZCXJNRyhkuVWT0eUKSVYu0JXsU-y3f93BY/edit)",
        },
        {
          name: "Not enough players?",
          value: `React with your empire icon and we will notify you if at least ${minPlayers} players express interest within the next hour.`,
        }
      );
  }

  // update subscriptions
  async function update() {
    const active = [];
    for (const [, reaction] of message.reactions.cache) {
      await reaction.users.fetch();
      for (const [, user] of reaction.users.cache) {
        active.push(user.id);
        if (
          user.id !== client.user.id &&
          !subscribers.find((s) => s.id === user.id)
        ) {
          subscribe(user);
        }
      }
    }
    for (const subscriber of subscribers) {
      if (!active.find((uid) => uid === subscriber.id)) {
        unsubscribe(subscriber);
      }
    }
  }

  function subscribe({ id, tag }) {
    console.info(`subscribe ${tag}`);
    const existing = subscribers.find((s) => s.id === id);
    if (existing) {
      existing.time = Date.now();
    } else {
      subscribers.push({
        id,
        tag,
        time: Date.now(),
      });
    }
  }

  async function unsubscribe({ id, tag }) {
    console.info(`unsubscribe ${tag}`);
    subscribers = subscribers.filter((s) => s.id !== id);
    for (const [, reaction] of message.reactions.cache) {
      await reaction.users.fetch();
      for (const [, user] of reaction.users.cache) {
        if (user.id !== id) {
          reaction.users.remove(id);
        }
      }
    }
  }

  // Update server stats every minute
  schedule.scheduleJob("*/1 * * * *", async () => {
    await update();
    serverStats = await fetchServerStats();
    message = await message.edit(embed());

    if (
      subscribers.length > 0 &&
      subscribers.length + serverStats.players.length >= minPlayers
    ) {
      const pings = subscribers.map((s) => `<@${s.id}>`).join(" ");
      await channel.send(
        `Your shuttle has arrived! ${subscribers.length} players are ready to play and ${serverStats.players.length} players are already online. ` +
          `We hope to see you on the battlefield.\n${pings}`
      );
      for (const subscriber of subscribers) {
        unsubscribe(subscriber);
      }
    }

    // filter out expired subscriptions
    for (const subscriber of subscribers) {
      if (Date.now() - subscriber.time > oneHourMiliseconds) {
        unsubscribe(subscriber);
      }
    }

    // clear notifications after 10 minutes
    const oldMessages = (await channel.messages.fetch({ limit: 10 })).filter(
      (m) =>
        m.author.id === client.user.id &&
        m.embeds.length === 0 &&
        Date.now() - m.createdTimestamp > oneHourMiliseconds / 10
    );
    for (const [, oldMessage] of oldMessages) {
      await oldMessage.delete();
    }
  });
});

async function fetchServerStats() {
  const res = await fetch("https://play.psforever.net/api/stats");
  return await res.json();
}
