import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { lavalink, type CustomPlayer } from "./audioManager";

async function resumeTrack(interaction: ChatInputCommandInteraction) {
  const player = lavalink.players.get(interaction.guildId!) as
    | CustomPlayer
    | undefined;
  if (!player) return "❌ No music is playing in this server.";

  if (!player.paused) return "⏯️ The player is already playing.";

  player.paused = false;
  return "▶️ Resumed the current track.";
}

export default {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume the paused track"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const result = await resumeTrack(interaction);
    await interaction.editReply(result);
  },
};
