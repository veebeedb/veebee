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
        .setName("kick")
        .setDescription("Kick a user from the server.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to kick")
                .setRequired(true)
        )
        .addStringOption((option: SlashCommandStringOption) =>
            option
                .setName("reason")
                .setDescription("Reason for the kick")
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
        if (!member.permissions.has(PermissionFlagsBits.KickMembers)) {
            await interaction.reply({ content: "You do not have permission to kick members.", flags: MessageFlags.Ephemeral });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.KickMembers)) {
            await interaction.reply({ content: "I do not have permission to kick members.", flags: MessageFlags.Ephemeral });
            return;
        }

        const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
            await interaction.reply({ content: "User not found in this server.", flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            await targetMember.kick(reason);
            await interaction.reply({ content: `Successfully kicked ${user.tag} for: ${reason}`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error("Error kicking user:", error);
            await interaction.reply({ content: "There was an error trying to kick the user.", flags: MessageFlags.Ephemeral });
        }
    },
};
