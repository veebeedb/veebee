import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Message,
  EmbedBuilder,
} from "discord.js";
import { sql } from "../../database/database.ts";

const boopResponses = [
  "Eee! You booped me! 💖",
  "Hehe, that tickles! 🌸",
  "Boop received! 💗",
  "Awww, boop back! 💖",
  "Stop it, I’m blushing! 🌸",
  "UwU, that boop made me happy! 💕",
  "Boop~! 🌸",
  "Pink fluff incoming! 💗",
  "*Tosses cherry blossoms at you* (･ω･)☆ 🌸",
  "Yay! Boop power! 💖",
  "Soft pink petals flutter! 🌸",
  "So kawaii ^.~💗",
  "Blushing pink cheeks! 💖",
  "Giggles and boops back (*≧ω≦*) 🌸",
  "Pink magic boop! 💕",
];

const rareResponses = [
  "✨ A magical boop appears! ✨",
  "🌸 Sakura petals swirl around you! 🌸",
  "💗 Super rare boop detected! 💗",
  "💖 Pink sparkles fill the air! 💖",
  "🌸 A rainbow of petals rains down! 🌸",
];

const boopGifs = ["https://c.tenor.com/88HZjGgr3k0AAAAd/tenor.gif"];

sql`CREATE TABLE IF NOT EXISTS boops (
  userId TEXT PRIMARY KEY,
  count INTEGER
);`;

const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000;
const showGifChance = 0.15;

export default {
  data: new SlashCommandBuilder()
    .setName("boop")
    .setDescription("Boop me, check your stats, or view the leaderboard!")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Use 'leaderboard' or 'stats' or leave empty to boop")
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const action = interaction.options.getString("action")?.toLowerCase();

    if (action === "leaderboard") {
      const topUsers = sql<{
        userId: string;
        count: number;
      }>`SELECT * FROM boops ORDER BY count DESC LIMIT 10`;
      if (topUsers.length === 0) {
        await interaction.reply("No boops yet! Be the first to boop 💖");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("🌸 Boop Leaderboard 🌸")
        .setColor("#FFC0CB")
        .setDescription(
          topUsers
            .map((u, i) => `${i + 1}. <@${u.userId}> - ${u.count} boops`)
            .join("\n")
        );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (action === "stats") {
      const row = sql<{
        count: number;
      }>`SELECT count FROM boops WHERE userId = ${userId}`[0];
      const total = row?.count ?? 0;
      await interaction.reply(`💖 You have booped me **${total} times**!`);
      return;
    }

    const now = Date.now();
    const lastBoop = cooldowns.get(userId) ?? 0;
    if (now - lastBoop < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - lastBoop)) / 1000);
      await interaction.reply({
        content: `💖 You can boop me again in ${remaining} seconds!`,
        ephemeral: true,
      });
      return;
    }

    cooldowns.set(userId, now);

    const isRare = Math.random() < 0.1;
    const messageContent = isRare
      ? rareResponses[Math.floor(Math.random() * rareResponses.length)]
      : boopResponses[Math.floor(Math.random() * boopResponses.length)];

    const gif =
      Math.random() < showGifChance
        ? boopGifs[Math.floor(Math.random() * boopGifs.length)]
        : undefined;

    const row = sql<{
      count: number;
    }>`SELECT count FROM boops WHERE userId = ${userId}`[0];
    const newCount = (row?.count ?? 0) + 1;

    if (row) {
      sql`UPDATE boops SET count = ${newCount} WHERE userId = ${userId}`;
    } else {
      sql`INSERT INTO boops (userId, count) VALUES (${userId}, ${newCount})`;
    }

    await interaction.reply({
      content: `${messageContent} (Total boops: ${newCount})`,
      ...(gif ? { files: [gif] } : {}),
    });
  },

  onMessage: async (message: Message) => {
    if (message.author.bot) return;
    if (!message.content.toLowerCase().includes("boop")) return;
    if (!message.mentions.has(message.client.user!)) return;

    const userId = message.author.id;
    const now = Date.now();
    const lastBoop = cooldowns.get(userId) ?? 0;
    if (now - lastBoop < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - lastBoop)) / 1000);
      await message.reply({
        content: `💖 You can boop me again in ${remaining} seconds!`,
      });
      return;
    }

    cooldowns.set(userId, now);

    const isRare = Math.random() < 0.1;
    const messageContent = isRare
      ? rareResponses[Math.floor(Math.random() * rareResponses.length)]
      : boopResponses[Math.floor(Math.random() * boopResponses.length)];

    const gif =
      Math.random() < showGifChance
        ? boopGifs[Math.floor(Math.random() * boopGifs.length)]
        : undefined;

    const row = sql<{
      count: number;
    }>`SELECT count FROM boops WHERE userId = ${userId}`[0];
    const newCount = (row?.count ?? 0) + 1;

    if (row) {
      sql`UPDATE boops SET count = ${newCount} WHERE userId = ${userId}`;
    } else {
      sql`INSERT INTO boops (userId, count) VALUES (${userId}, ${newCount})`;
    }

    await message.reply({
      content: `${messageContent} (Total boops: ${newCount})`,
      ...(gif ? { files: [gif] } : {}),
    });
  },
};
