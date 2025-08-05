import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    SlashCommandStringOption,
    GuildMember,
    User,
} from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a user for a certain duration.")
        .addUserOption(option =>
            option.setName("target")
                .setDescription("The user to timeout")
                .setRequired(true)
        )
        .addStringOption((option: SlashCommandStringOption) =>
            option.setName("duration")
                .setDescription("Timeout duration (e.g., 10m, 1h, 1d)")
                .setRequired(true)
        )
        .addStringOption((option: SlashCommandStringOption) =>
            option.setName("reason")
                .setDescription("Reason for the timeout")
                .setRequired(false)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const user = interaction.options.getUser("target", true);
        const durationRaw = interaction.options.getString("duration", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";

        if (!interaction.guild) {
            await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
            return;
        }

        const member = interaction.member as GuildMember;
        if (!member.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
            await interaction.reply({ content: "You do not have permission to timeout members.", ephemeral: true });
            return;
        }

        const targetMember = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!targetMember) {
            await interaction.reply({ content: "User not found in this server.", ephemeral: true });
            return;
        }

        const durationMs = parseDuration(durationRaw);
        if (!durationMs || durationMs < 5000 || durationMs > 28 * 24 * 60 * 60 * 1000) {
            await interaction.reply({
                content: "Please specify a valid duration between 5 seconds and 28 days (e.g., 10m, 1h, 2d).",
                ephemeral: true,
            });
            return;
        }

        try {
            await targetMember.timeout(durationMs, reason);

            try {
                const dm = await user.createDM();
                await dm.send(`You have been timed out in ${interaction.guild.name} for: ${reason}\nDuration: ${durationRaw}`);
            } catch (dmError) {
                console.warn(`Could not DM ${user.tag}`);
            }

            await interaction.reply({
                content: `Timed out ${user.tag} for ${durationRaw}.\nReason: ${reason}`,
                ephemeral: true,
            });
        } catch (err) {
            console.error(err);
            await interaction.reply({
                content: "Failed to timeout the user.",
                ephemeral: true,
            });
        }
    },
};

function parseDuration(input: string): number | null {
    const match = input.match(/^(\d+)([smhd])$/i);
    if (!match || match.length < 3) return null;

    const valueStr = match[1];
    const unitStr = match[2];

    if (!valueStr || !unitStr) return null;

    const value = parseInt(valueStr);
    if (isNaN(value)) return null;

    const unit = unitStr.toLowerCase();

    const multipliers: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };

    const multiplier = multipliers[unit];
    if (!multiplier) return null;

    return value * multiplier;
}