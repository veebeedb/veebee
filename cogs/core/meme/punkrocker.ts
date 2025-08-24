import {
    Message,
    ChatInputCommandInteraction,
    SlashCommandBuilder
} from "discord.js";

const messageContent = "Cause I'm a punkrocker, yes I am";

export default {
    data: new SlashCommandBuilder()
        .setName("punkrocker")
        .setDescription("Replies with the punkrocker anthem!"),

    async execute(interaction: ChatInputCommandInteraction) {
        try {
            await interaction.reply({ content: String(messageContent) });
        } catch (err) {
            console.error("Slash command reply failed:", err);
        }
    },

    async onMessage(message: Message) {
        if (message.author.bot) return;

        if (message.content.toLowerCase().includes("punkrocker")) {
            try {
                await message.reply({ content: String(messageContent) });
            } catch (err) {
                console.error("Message reply failed:", err);
            }
        }
    },
};
