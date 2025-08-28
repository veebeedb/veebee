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
            switch (subcommand) {
                case "skip":
                    await axios.post(`${BASE_URL}/next`, {}, {
                        headers: { Authorization: `Bearer ${API_KEY}` },
                    });
                    await interaction.editReply("⏭️ Skipped to the next track!");
                    break;

                case "restart":
                    await axios.post(`${BASE_URL}/restart`, {}, {
                        headers: { Authorization: `Bearer ${API_KEY}` },
                    });
                    await interaction.editReply("🔄 Station restarted!");
                    break;

                case "status":
                    const res = await axios.get(BASE_URL, {
                        headers: { Authorization: `Bearer ${API_KEY}` },
                    });
                    const stationStatus = res.data?.status ?? "unknown";
                    const nowPlaying = res.data?.now_playing?.song?.title ?? "Nothing";
                    await interaction.editReply(
                        `📻 Station status: **${stationStatus}**\n🎵 Now playing: **${nowPlaying}**`
                    );
                    break;

                default:
                    await interaction.editReply("⚠️ Unknown subcommand.");
            }
        } catch (error) {
            console.error("AzuraCast error:", error);
            await interaction.editReply("⚠️ Failed to execute AzuraCast command.");
        }
    },
};
