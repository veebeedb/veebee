import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Message,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  ThreadChannel,
  NewsChannel,
  DMChannel,
  PartialDMChannel,
  Client,
} from "discord.js";
import { sql } from "../../database/database";

sql`
CREATE TABLE IF NOT EXISTS mom_settings (
  guildId TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  respondInDMs INTEGER DEFAULT 0
);
`;

sql`
CREATE TABLE IF NOT EXISTS mom_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guildId TEXT,
  moderatorId TEXT,
  action TEXT,
  details TEXT,
  createdAt INTEGER
);
`;

sql`
CREATE TABLE IF NOT EXISTS mom_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guildId TEXT,
  channelId TEXT,
  userId TEXT,
  triggerText TEXT,
  responseText TEXT,
  createdAt INTEGER
);
`;

function isSendableChannel(
  ch: any
): ch is
  | TextChannel
  | ThreadChannel
  | NewsChannel
  | DMChannel
  | PartialDMChannel {
  return !!ch && typeof ch.send === "function";
}

async function sendViaDiscordRest(
  channelId: string,
  content: string
): Promise<any> {
  const token =
    process.env.DISCORD_TOKEN ??
    process.env.BOT_TOKEN ??
    process.env.TOKEN ??
    null;
  if (!token)
    throw new Error(
      "No bot token in environment (DISCORD_TOKEN/BOT_TOKEN/TOKEN)"
    );

  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord API returned ${res.status}: ${text}`);
  }

  return res.json();
}

export default {
  data: new SlashCommandBuilder()
    .setName("mom")
    .setDescription("Enable or disable MomBot responses")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Enable MomBot responses in this server")
        .addBooleanOption((opt) =>
          opt
            .setName("dms")
            .setDescription("Also respond in DMs?")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable MomBot responses in this server")
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Check if MomBot is enabled here")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        content: "This command must be used in a server.",
        flags: 64,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "enable") {
      const dms = interaction.options.getBoolean("dms") ?? false;
      sql`
        INSERT INTO mom_settings (guildId, enabled, respondInDMs)
        VALUES (${guildId}, 1, ${dms ? 1 : 0})
        ON CONFLICT(guildId) DO UPDATE SET enabled = 1, respondInDMs = ${
          dms ? 1 : 0
        }
      `;
      sql`
        INSERT INTO mom_actions (guildId, moderatorId, action, details, createdAt)
        VALUES (${guildId}, ${interaction.user.id}, "enable", ${`respondInDMs=${
        dms ? 1 : 0
      }`}, ${Date.now()})
      `;
      await interaction.reply({
        content: `✅ MomBot enabled. Respond in DMs: ${dms ? "yes" : "no"}`,
        flags: 64,
      });
    } else if (sub === "disable") {
      sql`UPDATE mom_settings SET enabled = 0 WHERE guildId = ${guildId}`;
      sql`
        INSERT INTO mom_actions (guildId, moderatorId, action, details, createdAt)
        VALUES (${guildId}, ${
        interaction.user.id
      }, "disable", ${""}, ${Date.now()})
      `;
      await interaction.reply({
        content: "❌ MomBot disabled in this server.",
        flags: 64,
      });
    } else if (sub === "status") {
      const row = sql<{ enabled: number; respondInDMs: number }>`
        SELECT enabled, respondInDMs FROM mom_settings WHERE guildId = ${guildId}
      `[0];
      if (!row || row.enabled === 0) {
        await interaction.reply({
          content: "ℹ️ MomBot is currently **disabled** here.",
          flags: 64,
        });
      } else {
        await interaction.reply({
          content: `ℹ️ MomBot is **enabled**. Respond in DMs: ${
            row.respondInDMs ? "yes" : "no"
          }`,
          flags: 64,
        });
      }
    }
  },

  async onMessage(message: Message, clientArg?: Client | null) {
    try {
      if (!message || message?.author?.bot) return;

      const guildId = message.guildId;
      if (!guildId) return;

      const row = sql<{ enabled: number; respondInDMs: number }>`
        SELECT enabled, respondInDMs FROM mom_settings WHERE guildId = ${guildId}
      `[0];

      if (!row || row.enabled === 0) return;

      const triggerRegex = /^\s*i['’]?m\s+(.+)/i;
      const m = (message.content ?? "").match(triggerRegex);
      if (!m) return;

      const after = (m[1] ?? "").trim();
      if (!after) return;

      const responseText = `Hey, ${after}, I'm Mom.`;

      const client: Client | null =
        (message as any).client ??
        clientArg ??
        (globalThis as any)._client ??
        null;

      const channelId: string | null =
        (message as any).channelId ??
        (message.channel && (message.channel as any).id) ??
        null;

      let sendTarget: any = null;
      const rawChannel = (message as any).channel ?? null;

      if (isSendableChannel(rawChannel)) {
        sendTarget = rawChannel;
      }

      if (!sendTarget && channelId && client) {
        try {
          const cached = client.channels.cache.get(channelId);
          if (isSendableChannel(cached)) {
            sendTarget = cached;
          } else {
            const fetched = await client.channels
              .fetch(channelId)
              .catch(() => null);
            if (isSendableChannel(fetched)) sendTarget = fetched;
          }
        } catch (err) {
          console.error("mom: channel resolution error:", err);
        }
      }

      if (!sendTarget && rawChannel && rawChannel.type) {
        if (
          rawChannel.type === ChannelType.GuildText ||
          rawChannel.type === ChannelType.PublicThread ||
          rawChannel.type === ChannelType.PrivateThread ||
          rawChannel.type === ChannelType.DM ||
          rawChannel.type === ChannelType.GuildAnnouncement
        ) {
          sendTarget = rawChannel;
        }
      }

      let sentSuccessfully = false;
      if (sendTarget && typeof sendTarget.send === "function") {
        try {
          await sendTarget.send(responseText);
          sentSuccessfully = true;
        } catch (sendErr) {
          console.error("Failed to send via channel.send():", sendErr);
          sentSuccessfully = false;
        }
      }

      if (!sentSuccessfully && channelId) {
        try {
          await sendViaDiscordRest(channelId, responseText);
          sentSuccessfully = true;
        } catch (restErr) {
          console.error("Failed to send via Discord REST fallback:", restErr);
        }
      }

      try {
        sql`
          INSERT INTO mom_messages (guildId, channelId, userId, triggerText, responseText, createdAt)
          VALUES (${guildId}, ${channelId ?? ""}, ${
          message.author.id
        }, ${after}, ${responseText}, ${Date.now()})
        `;
      } catch (dbErr) {
        console.error("Failed to log mom_messages:", dbErr);
      }

      if (!sentSuccessfully) {
        console.warn("MomBot: could not send message via any method. Debug:");
        console.warn({
          rawChannelPresent: !!rawChannel,
          channelId,
          hasClient: !!client,
          clientType: client
            ? client.constructor && (client.constructor as any).name
            : null,
          guildId: message.guildId ?? null,
          envTokenFound: !!(
            process.env.DISCORD_TOKEN ??
            process.env.BOT_TOKEN ??
            process.env.TOKEN
          ),
        });
      }
    } catch (err) {
      console.error("Error in onMessage:", err);
    }
  },
};
