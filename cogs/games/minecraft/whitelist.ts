import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    MessageFlags,
} from "discord.js";
import { Rcon } from "rcon-client";
import { sql } from "../../core/database/database";
import type { Command } from "../../core/libs/types";
import axios from "axios";

const rconHost = process.env.RCON_HOST ?? "";
const rconPort = parseInt(process.env.RCON_PORT ?? "25575");
const rconPassword = process.env.RCON_PASSWORD ?? "";

async function ensureTableExists() {
    await sql`
    CREATE TABLE IF NOT EXISTS whitelist (
      username TEXT PRIMARY KEY
    );
  `;
}

interface WhitelistUser {
    username: string;
}

const command: Command = {
    data: new SlashCommandBuilder()
        .setName("whitelist")
        .setDescription("Manage the Minecraft whitelist")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Add a player to the whitelist")
                .addStringOption(option =>
                    option
                        .setName("username")
                        .setDescription("Minecraft username")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove a player from the whitelist")
                .addStringOption(option =>
                    option
                        .setName("username")
                        .setDescription("Minecraft username")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Show all whitelisted players")
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.isChatInputCommand()) return;

        const subcommand = interaction.options.getSubcommand();
        const username = interaction.options.getString("username") ?? undefined;

        await ensureTableExists();

        const rcon = await Rcon.connect({
            host: rconHost,
            port: rconPort,
            password: rconPassword,
        });

        if (subcommand === "add") {
            const data = await axios
                .get(`https://api.mojang.com/users/profiles/minecraft/${username}`)
                .then(res => res.data)
                .catch(() => null);

            if (!data) {
                await interaction.reply({
                    content: "Username not found via Mojang API.",
                    flags: MessageFlags.Ephemeral,
                });
                rcon.end();
                return;
            }

            await rcon.send(`whitelist add ${username}`);
            await sql`INSERT OR IGNORE INTO whitelist (username) VALUES (${username})`;

            await interaction.reply({
                content: `${username} has been added to the whitelist.`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === "remove") {
            await rcon.send(`whitelist remove ${username}`);
            await sql`DELETE FROM whitelist WHERE username = ${username}`;
            await interaction.reply({
                content: `${username} has been removed from the whitelist.`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === "list") {
            const rows = await sql<WhitelistUser>`SELECT username FROM whitelist`;
            const list = rows.map(row => row.username).join(", ") || "No players whitelisted.";
            await interaction.reply({
                content: `Whitelisted users: ${list}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        rcon.end();
    },
};

export default command;
