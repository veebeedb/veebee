import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import type { Manager } from "erela.js";

async function pauseTrack(
  manager: Manager,
  interaction: ChatInputCommandInteraction
) {
  const player = manager.players.get(interaction.guildId!);
  if (!player) return "No music is playing.";

  if (player.paused) return "The player is already paused.";

  player.pause(true);
  return "⏸️ Paused the current track.";
}

export default {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause the current track"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();
    const manager: Manager = (globalThis as any).manager;
    const result = await pauseTrack(manager, interaction);
    await interaction.editReply(result);
  },
};
