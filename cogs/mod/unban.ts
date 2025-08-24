import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    SlashCommandStringOption,
    PermissionsBitField,
    MessageFlags,
} from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Unban a user from the server.")
        .addStringOption((option: SlashCommandStringOption) =>
            option
                .setName("userid")
                .setDescription("The ID of the user to unban")
                .setRequired(true)
        )
        .addStringOption((option: SlashCommandStringOption) =>
            option
                .setName("reason")
                .setDescription("Reason for the unban")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.guild) {
            await interaction.reply({ content: "This command can only be used in a server.", flags: MessageFlags.Ephemeral });
            return;
        }

        const member = interaction.member;
        if (!member) {
            await interaction.reply({ content: "Could not fetch your member data.", flags: MessageFlags.Ephemeral });
            return;
        }

        const permissions = member.permissions instanceof PermissionsBitField
            ? member.permissions
            : new PermissionsBitField(BigInt(member.permissions as string));

        if (!permissions.has(PermissionFlagsBits.BanMembers)) {
            await interaction.reply({ content: "You do not have permission to unban members.", flags: MessageFlags.Ephemeral });
            return;
        }

        const botMember = interaction.guild.members.me;
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
            await interaction.reply({ content: "I do not have permission to unban members.", flags: MessageFlags.Ephemeral });
            return;
        }

        const userId = interaction.options.getString("userid", true);
        const reason = interaction.options.getString("reason") || "No reason provided";

        try {
            const bans = await interaction.guild.bans.fetch();
            if (!bans.has(userId)) {
                await interaction.reply({ content: "That user is not banned.", flags: MessageFlags.Ephemeral });
                return;
            }

            await interaction.guild.bans.remove(userId, reason);
            await interaction.reply({ content: `Successfully unbanned user with ID ${userId} for: ${reason}`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error("Error unbanning user:", error);
            await interaction.reply({ content: "There was an error trying to unban the user.", flags: MessageFlags.Ephemeral });
        }
    },
};
