import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { lavalink } from "./audioManager";

async function stopTrack(interaction: ChatInputCommandInteraction) {
    const player = lavalink.players.get(interaction.guildId!);
    if (!player) return "❌ No track is currently playing.";

    player.queue.clear();
    await player.stop();
    player.destroy();

    return "⏹️ Stopped playback and cleared the queue.";
}

export default {
    data: new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Stop playback and clear the queue"),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        const result = await stopTrack(interaction);
        await interaction.editReply(result);
    },
};
