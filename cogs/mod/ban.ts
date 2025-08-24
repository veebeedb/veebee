import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    SlashCommandStringOption,
    GuildMember,
    MessageFlags,
} from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to ban")
                .setRequired(true)
        )
        .addStringOption((option: SlashCommandStringOption) =>
            option
                .setName("reason")
                .setDescription("Reason for the ban")
                .setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const user = interaction.options.getUser("target", true);
        const reason = interaction.options.getString("reason", true) || "No reason provided";

        if (!interaction.guild) {
            await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
            return;
        }

        const member = interaction.member as GuildMember;
        if (!member.permissions.has(PermissionFlagsBits.BanMembers)) {
            await interaction.reply({ content: "You do not have permission to ban members.", flags: MessageFlags.Ephemeral });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            await interaction.reply({ content: "I do not have permission to ban members.", flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            await interaction.guild.members.ban(user.id, { reason });
            await interaction.reply({ content: `Successfully banned ${user.tag} for: ${reason}`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error("Error banning user:", error);
            await interaction.reply({ content: "There was an error trying to ban the user.", flags: MessageFlags.Ephemeral });
        }
    },
};
