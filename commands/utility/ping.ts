import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency."),

  async execute(interaction: ChatInputCommandInteraction) {
    const wsLatency = interaction.client.ws.ping;
    const apiLatency = Date.now() - interaction.createdTimestamp;

    const embed = new EmbedBuilder()
      .setTitle("Latency Info")
      .addFields(
        { name: "WebSocket Ping", value: `${wsLatency} ms`, inline: true },
        { name: "API Latency", value: `${apiLatency} ms`, inline: true }
      )
      .setColor("#FF91A4")
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
