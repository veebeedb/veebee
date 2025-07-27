import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("rigby")
        .setDescription("Rigby"),

    async execute(interaction: ChatInputCommandInteraction) {
        const gifUrl = "https://tenor.com/view/rigby-cat-rigby-cat-cat-stare-rigby-tongue-gif-12118654088387148905";

        await interaction.reply({ content: gifUrl });
    },
};
