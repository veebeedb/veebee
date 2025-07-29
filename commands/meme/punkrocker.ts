import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("punkrocker")
        .setDescription("Cause I'm a punkrocker, yes I am"),

    async execute(interaction: ChatInputCommandInteraction) {
        const messageContent = "Cause I'm a punkrocker, yes I am";

        await interaction.reply({ content: messageContent });
    },
};
