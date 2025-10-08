import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { lavalink, type CustomPlayer } from "./audioManager";

export default {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song in your voice channel")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Song name or URL")
        .setRequired(true)
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);

    const member = interaction.member as any;
    const channel = member?.voice?.channel;
    if (!channel)
      return interaction.editReply("❌ You must be in a voice channel!");

    if (!lavalink.nodeManager.leastUsedNodes()?.length) {
      await new Promise<void>((resolve) => {
        lavalink.nodeManager.once("connect", () => resolve());
      });
    }

    const player = lavalink.createPlayer({
      guildId: interaction.guildId!,
      voiceChannelId: channel.id,
      textChannelId: interaction.channelId,
      selfDeaf: true,
    }) as CustomPlayer;

    try {
      if (!player.connected) await player.connect();

      const search = await player.search(query, interaction.user.id);
      if (!search || !search.tracks.length)
        return interaction.editReply("❌ No results found.");

      const track = search.tracks[0];
      if (!track)
        return interaction.editReply("❌ Track could not be resolved.");

      player.queue.add(track);

      if (!player.playing) await player.play();

      return interaction.editReply(
        `🎶 Added **${track.info.title}** to the queue!`
      );
    } catch (err) {
      console.error("[Play Command] Error:", err);
      return interaction.editReply(
        "❌ An error occurred while trying to play the track."
      );
    }
  },
};
