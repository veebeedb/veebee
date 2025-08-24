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
        .setName("warn")
        .setDescription("Warn a user via DM.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to warn")
                .setRequired(true)
        )
        .addStringOption((option: SlashCommandStringOption) =>
            option
                .setName("reason")
                .setDescription("Reason for the warning")
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
        if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            await interaction.reply({ content: "You do not have permission to warn members.", flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            await user.send(
                `You have been warned in **${interaction.guild.name}** for the following reason:\n> ${reason}`
            );
            await interaction.reply({ content: `Successfully warned ${user.tag} via DM.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error("Failed to send DM:", error);
            await interaction.reply({
                content: `Could not DM ${user.tag}, but the warning was issued.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
