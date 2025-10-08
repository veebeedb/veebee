import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { lavalink, type CustomPlayer } from "./audioManager";

async function skipTrack(interaction: ChatInputCommandInteraction) {
  const player = lavalink.players.get(interaction.guildId!) as
    | CustomPlayer
    | undefined;
  if (!player || !player.queue.current) {
    return "❌ No track is currently playing.";
  }

  player.queue.remove(0);

  const nextTrack = player.queue.current;
  if (nextTrack) {
    await player.play({ track: nextTrack });
    return `⏭️ Skipped to **${nextTrack.info.title}**`;
  } else {
    await player.pause(true);
    return "⏹️ Skipped the last track and stopped playback.";
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip the current track"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const result = await skipTrack(interaction);
    await interaction.editReply(result);
  },
};
