import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import axios from "axios";

const BASE_URL = Bun.env.AZURACAST_API_URL!;
const API_KEY = Bun.env.AZURACAST_API_KEY!;

export default {
    data: new SlashCommandBuilder()
        .setName("azuracast")
        .setDescription("Manage AzuraCast station")
        .addSubcommand((sub) =>
            sub.setName("skip").setDescription("Skip the current AzuraCast song")
        )
        .addSubcommand((sub) =>
            sub.setName("restart").setDescription("Restart the AzuraCast station")
        )
        .addSubcommand((sub) =>
            sub.setName("status").setDescription("Check the AzuraCast station status")
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.isChatInputCommand()) return;
        const subcommand = interaction.options.getSubcommand();

        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === "skip") {
                await axios.post(`${BASE_URL}/next`, {}, {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                });
                await interaction.editReply("⏭️ Skipped to the next track!");
            }

            if (subcommand === "restart") {
                await axios.post(`${BASE_URL}/restart`, {}, {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                });
                await interaction.editReply("🔄 Station restarted!");
            }

            if (subcommand === "status") {
                const res = await axios.get(`${BASE_URL}/status`, {
                    headers: { Authorization: `Bearer ${API_KEY}` },
                });
                await interaction.editReply(
                    `📻 Station status: **${res.data?.status ?? "unknown"}**`
                );
            }
        } catch (error) {
            console.error("AzuraCast error:", error);
            await interaction.editReply("⚠️ Failed to process AzuraCast command.");
        }
    },
};
