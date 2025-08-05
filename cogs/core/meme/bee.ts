import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("bee")
        .setDescription("Bee"),

    async execute(interaction: ChatInputCommandInteraction) {
        const messageContent = "<:Terraria_Small_Bee:1399587480218505382>";

        await interaction.reply({ content: messageContent });
    },
};
