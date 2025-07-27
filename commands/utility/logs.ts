import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";

// Simple in-memory log storage (replace with DB or file in real usage)
const modLogs: {
    action: "Ban" | "Warn" | "Timeout" | string;
    userId: string;
    userTag: string;
    moderatorId: string;
    moderatorTag: string;
    reason: string;
    timestamp: number;
    duration?: string; // for timeout
}[] = [];

// Utility function to add logs - call this from your mod commands
export function addModLog(log: typeof modLogs[0]) {
    modLogs.push(log);
    // Optional: limit size for memory, e.g. keep last 100 logs
    if (modLogs.length > 100) modLogs.shift();
}

export default {
    data: new SlashCommandBuilder()
        .setName("logs")
        .setDescription("Show recent moderation logs")
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog),

    async execute(interaction: ChatInputCommandInteraction) {
        if (modLogs.length === 0) {
            await interaction.reply({ content: "No moderation logs yet.", ephemeral: true });
            return;
        }

        // Show last 10 logs, newest first
        const logsToShow = modLogs.slice(-10).reverse();

        const embed = new EmbedBuilder()
            .setTitle("Recent Moderation Logs")
            .setColor("DarkBlue")
            .setTimestamp();

        for (const log of logsToShow) {
            let desc = `**User:** <@${log.userId}> (${log.userTag})\n` +
                `**Action:** ${log.action}\n` +
                `**Moderator:** <@${log.moderatorId}> (${log.moderatorTag})\n` +
                `**Reason:** ${log.reason}\n` +
                `**Date:** <t:${Math.floor(log.timestamp / 1000)}:f>`;

            if (log.action.toLowerCase() === "timeout" && log.duration) {
                desc += `\n**Duration:** ${log.duration}`;
            }

            embed.addFields({ name: "\u200B", value: desc });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
