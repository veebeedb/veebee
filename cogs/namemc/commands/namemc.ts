import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageComponentInteraction,
} from "discord.js";
import { sql } from "../../core/database/database.ts";
import NamemcAPI from "../api/namemc.ts";
import type {
  FullNameMCProfile,
  NameMCSkinEntry,
  NameHistoryEntry,
} from "../api/namemc.ts";

sql`CREATE TABLE IF NOT EXISTS namemc_optouts (
  userId TEXT PRIMARY KEY
);`;

sql`CREATE TABLE IF NOT EXISTS namemc_stats (
  userId TEXT PRIMARY KEY,
  lookups INTEGER
);`;

type Maybe<T> = T | undefined;

const SKINS_PER_PAGE = 4;
const CAROUSEL_TIMEOUT_MS = 120_000;

export default {
  data: new SlashCommandBuilder()
    .setName("namemc")
    .setDescription("Lookup Minecraft profiles and view NameMC data")
    .addSubcommand((s) =>
      s
        .setName("lookup")
        .setDescription("Lookup a Minecraft username")
        .addStringOption((o) =>
          o
            .setName("username")
            .setDescription("Minecraft username or UUID")
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("skins")
        .setDescription("Show skin history for a user")
        .addStringOption((o) =>
          o
            .setName("username")
            .setDescription("Minecraft username or UUID")
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("names")
        .setDescription("Show username history")
        .addStringOption((o) =>
          o
            .setName("username")
            .setDescription("Minecraft username or UUID")
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("extras")
        .setDescription("Show NameMC extras (about, links, followers)")
        .addStringOption((o) =>
          o
            .setName("username")
            .setDescription("Minecraft username or UUID")
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("optout")
        .setDescription("Opt out of using NameMC lookups yourself")
    )
    .addSubcommand((s) =>
      s
        .setName("optin")
        .setDescription("Opt back in to NameMC lookups yourself")
    )
    .addSubcommand((s) =>
      s.setName("stats").setDescription("Show your lookup stats")
    )
    .addSubcommand((s) =>
      s.setName("leaderboard").setDescription("Top users by lookup count")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const callerId = interaction.user.id;

    if (sub === "optout") {
      const row = sql<{
        userId: string;
      }>`SELECT userId FROM namemc_optouts WHERE userId = ${callerId}`[0];
      if (row) {
        await interaction.reply({
          content: "You are already opted out of NameMC lookups.",
          ephemeral: true,
        });
        return;
      }
      sql`INSERT INTO namemc_optouts (userId) VALUES (${callerId})`;
      await interaction.reply({
        content: "You are now opted out of NameMC lookups.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "optin") {
      const row = sql<{
        userId: string;
      }>`SELECT userId FROM namemc_optouts WHERE userId = ${callerId}`[0];
      if (!row) {
        await interaction.reply({
          content: "You are already opted in.",
          ephemeral: true,
        });
        return;
      }
      sql`DELETE FROM namemc_optouts WHERE userId = ${callerId}`;
      await interaction.reply({
        content: "You are now opted back in to NameMC lookups.",
        ephemeral: true,
      });
      return;
    }

    if (sub === "stats") {
      const r = sql<{
        lookups: number;
      }>`SELECT lookups FROM namemc_stats WHERE userId = ${callerId}`[0];
      const total = r?.lookups ?? 0;
      await interaction.reply({
        content: `You have performed ${total} lookups.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "leaderboard") {
      const top = sql<{
        userId: string;
        lookups: number;
      }>`SELECT userId, lookups FROM namemc_stats ORDER BY lookups DESC LIMIT 10`;
      if (!top || top.length === 0) {
        await interaction.reply("No lookups recorded yet.");
        return;
      }
      const desc = top
        .map((u, i) => `${i + 1}. <@${u.userId}> - ${u.lookups} lookups`)
        .join("\n");
      const embed = new EmbedBuilder()
        .setTitle("NameMC Lookup Leaderboard")
        .setDescription(desc)
        .setColor(0xffc0cb);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    const username = interaction.options.getString("username", true);

    const optRow = sql<{
      userId: string;
    }>`SELECT userId FROM namemc_optouts WHERE userId = ${callerId}`[0];
    if (optRow) {
      await interaction.reply({
        content:
          "You have opted out. Use /namemc optin to enable lookups again.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      if (sub === "lookup") {
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await interaction.editReply(`No profile found for ${username}`);
          return;
        }
        incrementLookupCount(callerId);

        const embed = buildFullProfileEmbed(full);
        const components = buildLinksRow(full.namemcExtras.externalLinks ?? []);
        await interaction.editReply({ embeds: [embed], components });
        return;
      }

      if (sub === "names") {
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await interaction.editReply(`No profile found for ${username}`);
          return;
        }
        incrementLookupCount(callerId);

        const names = full.mojangNameHistory.map((n) => {
          if (n.changedToAt) {
            const d = new Date(n.changedToAt)
              .toISOString()
              .replace("T", " ")
              .split(".")[0];
            return `${n.name} (changed at ${d} UTC)`;
          }
          return `${n.name} (original)`;
        });
        const nmNames = full.namemcExtras.nameHistoryFromNameMC;
        if (nmNames && nmNames.length > 0) {
          names.push("", "NameMC-specific history:");
          names.push(...nmNames.map((n) => n.name));
        }

        const embed = new EmbedBuilder()
          .setTitle(`${full.mojang.username} - Name History`)
          .setDescription(names.join("\n"))
          .setColor(0x00adef);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (sub === "skins") {
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await interaction.editReply(`No profile found for ${username}`);
          return;
        }
        incrementLookupCount(callerId);

        const skins = full.namemcExtras.skins ?? [];
        const items: NameMCSkinEntry[] =
          skins.length > 0
            ? skins
            : full.mojang.skin
            ? [
                {
                  id: full.mojang.rawUuid,
                  url: `https://namemc.com/profile/${full.mojang.uuid}`,
                  thumbnail: full.mojang.skin,
                } as NameMCSkinEntry,
              ]
            : [];

        if (items.length === 0) {
          await interaction.editReply("No skins found for this profile.");
          return;
        }

        let page = 0;
        const totalPages = Math.ceil(items.length / SKINS_PER_PAGE);

        const buildPageEmbed = (p: number) => {
          const slice = items.slice(
            p * SKINS_PER_PAGE,
            p * SKINS_PER_PAGE + SKINS_PER_PAGE
          );
          const embed = new EmbedBuilder()
            .setTitle(
              `${full.mojang.username} - Skins (${p + 1}/${totalPages})`
            )
            .setColor(0x00adef)
            .setDescription(`Showing ${slice.length} skins`);
          for (const s of slice) {
            embed.addFields({
              name: s.id ?? "skin",
              value: s.url ?? "no url",
              inline: false,
            });
            if (s.thumbnail) {
              embed.setImage(s.thumbnail);
            }
          }
          return embed;
        };

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`nm_prev_${interaction.id}`)
            .setLabel("Prev")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(totalPages <= 1),
          new ButtonBuilder()
            .setCustomId(`nm_next_${interaction.id}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(totalPages <= 1)
        );

        const sent = await interaction.editReply({
          embeds: [buildPageEmbed(0)],
          components: [row],
        });

        if (totalPages <= 1) return;

        const msg = sent as Message;
        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: CAROUSEL_TIMEOUT_MS,
          filter: (i: MessageComponentInteraction) => i.user.id === callerId,
        });

        collector.on("collect", async (i) => {
          await i.deferUpdate();
          if (i.customId === `nm_prev_${interaction.id}`) {
            page = (page - 1 + totalPages) % totalPages;
          } else if (i.customId === `nm_next_${interaction.id}`) {
            page = (page + 1) % totalPages;
          }
          await i.editReply({
            embeds: [buildPageEmbed(page)],
            components: [row],
          });
        });

        collector.on("end", async () => {
          try {
            const disabledRow =
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`nm_prev_${interaction.id}`)
                  .setLabel("Prev")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId(`nm_next_${interaction.id}`)
                  .setLabel("Next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true)
              );
            await interaction.editReply({ components: [disabledRow] });
          } catch {}
        });

        return;
      }

      if (sub === "extras") {
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await interaction.editReply(`No profile found for ${username}`);
          return;
        }
        incrementLookupCount(callerId);

        const about = full.namemcExtras.about ?? "No about text found.";
        const followers = full.namemcExtras.followers ?? null;
        const views = full.namemcExtras.viewsMonth ?? null;
        const embed = new EmbedBuilder()
          .setTitle(`${full.mojang.username} - Extras`)
          .setDescription(about)
          .setColor(0x00adef)
          .addFields(
            {
              name: "Followers",
              value: followers !== null ? String(followers) : "Unknown",
              inline: true,
            },
            { name: "Views / month", value: views ?? "Unknown", inline: true }
          );

        const links = full.namemcExtras.externalLinks ?? [];
        const components = buildLinksRow(links);
        await interaction.editReply({ embeds: [embed], components });
        return;
      }
    } catch (err) {
      console.error("namemc execute error", err);
      try {
        await interaction.editReply(
          "An error occurred while fetching NameMC data."
        );
      } catch {}
    }
  },

  async prefixCommand(message: Message, args: string[]) {
    const callerId = message.author.id;
    const subRaw = args.shift();
    if (!subRaw) {
      await message.reply(
        "Usage: namemc lookup <username> | namemc skins <username> | namemc names <username> | namemc extras <username> | namemc optout | namemc optin | namemc stats | namemc leaderboard"
      );
      return;
    }
    const sub = subRaw.toLowerCase();

    if (sub === "optout") {
      const r = sql<{
        userId: string;
      }>`SELECT userId FROM namemc_optouts WHERE userId = ${callerId}`[0];
      if (r) {
        await message.reply("You are already opted out of NameMC lookups.");
        return;
      }
      sql`INSERT INTO namemc_optouts (userId) VALUES (${callerId})`;
      await message.reply("You are now opted out of NameMC lookups.");
      return;
    }

    if (sub === "optin") {
      const r = sql<{
        userId: string;
      }>`SELECT userId FROM namemc_optouts WHERE userId = ${callerId}`[0];
      if (!r) {
        await message.reply("You are already opted in.");
        return;
      }
      sql`DELETE FROM namemc_optouts WHERE userId = ${callerId}`;
      await message.reply("You are now opted in to NameMC lookups.");
      return;
    }

    if (sub === "stats") {
      const r = sql<{
        lookups: number;
      }>`SELECT lookups FROM namemc_stats WHERE userId = ${callerId}`[0];
      const total = r?.lookups ?? 0;
      await message.reply(`You have performed ${total} lookups.`);
      return;
    }

    if (sub === "leaderboard") {
      const top = sql<{
        userId: string;
        lookups: number;
      }>`SELECT userId, lookups FROM namemc_stats ORDER BY lookups DESC LIMIT 10`;
      if (!top || top.length === 0) {
        await message.reply("No lookups recorded yet.");
        return;
      }
      const desc = top
        .map((u, i) => `${i + 1}. <@${u.userId}> - ${u.lookups} lookups`)
        .join("\n");
      const embed = new EmbedBuilder()
        .setTitle("NameMC Lookup Leaderboard")
        .setDescription(desc)
        .setColor(0xffc0cb);
      await message.reply({ embeds: [embed] });
      return;
    }

    const username = args.join(" ").trim();
    if (!username) {
      await message.reply("You must provide a username or UUID.");
      return;
    }

    const optRow = sql<{
      userId: string;
    }>`SELECT userId FROM namemc_optouts WHERE userId = ${callerId}`[0];
    if (optRow) {
      await message.reply(
        "You have opted out. Use namemc optin to enable lookups again."
      );
      return;
    }

    try {
      if (sub === "lookup") {
        const sent = await message.reply("Looking up profile...");
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await sent.edit("No profile found for that username.");
          return;
        }
        incrementLookupCount(callerId);

        const embed = buildFullProfileEmbed(full);
        const components = buildLinksRow(full.namemcExtras.externalLinks ?? []);
        await sent.edit({ content: undefined, embeds: [embed], components });
        return;
      }

      if (sub === "names") {
        const sent = await message.reply("Fetching name history...");
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await sent.edit("No profile found.");
          return;
        }
        incrementLookupCount(callerId);

        const names = full.mojangNameHistory.map((n) => {
          if (n.changedToAt) {
            const d = new Date(n.changedToAt)
              .toISOString()
              .replace("T", " ")
              .split(".")[0];
            return `${n.name} (changed at ${d} UTC)`;
          }
          return `${n.name} (original)`;
        });
        const nmNames = full.namemcExtras.nameHistoryFromNameMC;
        if (nmNames && nmNames.length > 0) {
          names.push("", "NameMC-specific history:");
          names.push(...nmNames.map((n) => n.name));
        }

        const embed = new EmbedBuilder()
          .setTitle(`${full.mojang.username} - Name History`)
          .setDescription(names.join("\n"))
          .setColor(0x00adef);
        await sent.edit({ content: undefined, embeds: [embed] });
        return;
      }

      if (sub === "skins") {
        const sent = await message.reply("Fetching skins...");
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await sent.edit("No profile found.");
          return;
        }
        incrementLookupCount(callerId);

        const skins = full.namemcExtras.skins ?? [];
        const items: NameMCSkinEntry[] =
          skins.length > 0
            ? skins
            : full.mojang.skin
            ? [
                {
                  id: full.mojang.rawUuid,
                  url: `https://namemc.com/profile/${full.mojang.uuid}`,
                  thumbnail: full.mojang.skin,
                } as NameMCSkinEntry,
              ]
            : [];

        if (items.length === 0) {
          await sent.edit("No skins found for this profile.");
          return;
        }

        let page = 0;
        const totalPages = Math.ceil(items.length / SKINS_PER_PAGE);

        const buildPageEmbed = (p: number) => {
          const slice = items.slice(
            p * SKINS_PER_PAGE,
            p * SKINS_PER_PAGE + SKINS_PER_PAGE
          );
          const embed = new EmbedBuilder()
            .setTitle(
              `${full.mojang.username} - Skins (${p + 1}/${totalPages})`
            )
            .setColor(0x00adef)
            .setDescription(`Showing ${slice.length} skins`);
          for (const s of slice) {
            embed.addFields({
              name: s.id ?? "skin",
              value: s.url ?? "no url",
              inline: false,
            });
            if (s.thumbnail) embed.setImage(s.thumbnail);
          }
          return embed;
        };

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`nm_prev_prefix_${message.id}`)
            .setLabel("Prev")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(totalPages <= 1),
          new ButtonBuilder()
            .setCustomId(`nm_next_prefix_${message.id}`)
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(totalPages <= 1)
        );

        const edited = await sent.edit({
          content: undefined,
          embeds: [buildPageEmbed(0)],
          components: [row],
        });

        if (totalPages <= 1) return;

        const msg = edited as Message;
        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: CAROUSEL_TIMEOUT_MS,
          filter: (i: MessageComponentInteraction) => i.user.id === callerId,
        });

        collector.on("collect", async (i) => {
          await i.deferUpdate();
          if (i.customId === `nm_prev_prefix_${message.id}`) {
            page = (page - 1 + totalPages) % totalPages;
          } else if (i.customId === `nm_next_prefix_${message.id}`) {
            page = (page + 1) % totalPages;
          }
          await i.editReply({
            embeds: [buildPageEmbed(page)],
            components: [row],
          });
        });

        collector.on("end", async () => {
          try {
            const disabledRow =
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`nm_prev_prefix_${message.id}`)
                  .setLabel("Prev")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId(`nm_next_prefix_${message.id}`)
                  .setLabel("Next")
                  .setStyle(ButtonStyle.Primary)
                  .setDisabled(true)
              );
            await msg.edit({ components: [disabledRow] });
          } catch {}
        });

        return;
      }

      if (sub === "extras") {
        const sent = await message.reply("Fetching extras...");
        const full = await NamemcAPI.getFullProfile(username);
        if (!full) {
          await sent.edit("No profile found.");
          return;
        }
        incrementLookupCount(callerId);

        const about = full.namemcExtras.about ?? "No about text found.";
        const followers = full.namemcExtras.followers ?? null;
        const views = full.namemcExtras.viewsMonth ?? null;
        const embed = new EmbedBuilder()
          .setTitle(`${full.mojang.username} - Extras`)
          .setDescription(about)
          .setColor(0x00adef)
          .addFields(
            {
              name: "Followers",
              value: followers !== null ? String(followers) : "Unknown",
              inline: true,
            },
            { name: "Views / month", value: views ?? "Unknown", inline: true }
          );

        const links = full.namemcExtras.externalLinks ?? [];
        const components = buildLinksRow(links);
        await sent.edit({ content: undefined, embeds: [embed], components });
        return;
      }

      await message.reply(
        "Unknown subcommand. See: namemc lookup|skins|names|extras|optout|optin|stats|leaderboard"
      );
    } catch (err) {
      console.error("namemc prefixCommand error", err);
      try {
        await message.reply("An error occurred while processing the command.");
      } catch {}
    }
  },

  async onMessage(message: Message) {
    if (message.author.bot) return;
    const content = message.content.trim();
    if (!content.toLowerCase().startsWith("namemc ")) return;

    const args = content.split(/\s+/).slice(1);
    const username = args.join(" ").trim();
    if (!username) return;

    const callerId = message.author.id;
    const optRow = sql<{
      userId: string;
    }>`SELECT userId FROM namemc_optouts WHERE userId = ${callerId}`[0];
    if (optRow) {
      await message.reply(
        "You have opted out. Use namemc optin to enable lookups again."
      );
      return;
    }

    const sent = await message.reply("Looking up profile...");
    try {
      const full = await NamemcAPI.getFullProfile(username);
      if (!full) {
        await sent.edit("No profile found.");
        return;
      }
      incrementLookupCount(callerId);

      const embed = buildFullProfileEmbed(full);
      const components = buildLinksRow(full.namemcExtras.externalLinks ?? []);
      await sent.edit({ content: undefined, embeds: [embed], components });
    } catch (err) {
      console.error("namemc onMessage error", err);
      await sent.edit("An error occurred while looking up the profile.");
    }
  },
};

function incrementLookupCount(userId: string) {
  const row = sql<{
    lookups: number;
  }>`SELECT lookups FROM namemc_stats WHERE userId = ${userId}`[0];
  const newCount = (row?.lookups ?? 0) + 1;
  if (row) {
    sql`UPDATE namemc_stats SET lookups = ${newCount} WHERE userId = ${userId}`;
  } else {
    sql`INSERT INTO namemc_stats (userId, lookups) VALUES (${userId}, ${newCount})`;
  }
}

function buildFullProfileEmbed(full: FullNameMCProfile) {
  const mojang = full.mojang;
  const embed = new EmbedBuilder()
    .setTitle(`${mojang.username}`)
    .setURL(`https://namemc.com/profile/${mojang.uuid}`)
    .setColor(0x00adef)
    .addFields(
      { name: "UUID", value: mojang.uuid, inline: true },
      { name: "Legacy", value: mojang.legacy ? "Yes" : "No", inline: true },
      { name: "Created", value: mojang.createdAt ?? "Unknown", inline: true }
    )
    .setFooter({
      text: `Fetched at ${
        new Date(full.fetchedAt).toISOString().replace("T", " ").split(".")[0]
      } UTC`,
    });

  if (mojang.skin) embed.setThumbnail(mojang.skin);
  if (full.namemcExtras.about)
    embed.addFields({
      name: "About",
      value: truncate(full.namemcExtras.about, 1024),
    });

  if (full.mojangNameHistory && full.mojangNameHistory.length > 0) {
    const preview = full.mojangNameHistory
      .slice(-5)
      .map((n) => n.name)
      .join(", ");
    embed.addFields({
      name: "Recent names",
      value: truncate(preview, 1024),
      inline: false,
    });
  }

  return embed;
}

function buildLinksRow(links: string[]) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const slice = links.slice(0, 5);
  for (const l of slice) {
    try {
      const url = new URL(l);
      const label = url.hostname.replace("www.", "");
      row.addComponents(
        new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(l)
      );
    } catch {}
  }
  return slice.length > 0 ? [row] : [];
}

function truncate(s: string, max = 1024) {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
