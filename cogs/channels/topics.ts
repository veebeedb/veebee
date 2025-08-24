import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    TextChannel,
    ChannelType,
    Collection,
    AutocompleteInteraction,
    MessageFlags,
    EmbedBuilder,
    Colors,
} from "discord.js";

import type { ExtendedClient } from "../../bot.ts";

export default {
    data: new SlashCommandBuilder()
        .setName("topic")
        .setDescription("Manage channel topics")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("set")
                .setDescription("Set topic for current or specified channel")
                .addStringOption(option =>
                    option
                        .setName("topic")
                        .setDescription("The topic to set")
                        .setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName("channel")
                        .setDescription("Channel to set topic for (defaults to current channel)")
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("sync")
                .setDescription("Sync topic across selected channels")
                .addStringOption(option =>
                    option
                        .setName("topic")
                        .setDescription("The topic to sync across channels")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("category")
                        .setDescription("Sync only channels in a specific category")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName("channels")
                        .setDescription("Comma-separated list of channels to include (leave empty for all channels)")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName("exclude")
                        .setDescription("Comma-separated list of channels to exclude")
                        .setRequired(false)
                        .setAutocomplete(true)
                )
                .addBooleanOption(option =>
                    option
                        .setName("skip_existing")
                        .setDescription("Skip channels that already have a topic set")
                        .setRequired(false)
                )
        ),

    async autocomplete(interaction: AutocompleteInteraction) {
        const focusedOption = interaction.options.getFocused(true);
        const guild = interaction.guild;

        if (!guild) return;

        if (focusedOption.name === "category") {
            const categories = guild.channels.cache
                .filter(channel => channel.type === ChannelType.GuildCategory)
                .map(category => category.name);

            const filtered = categories.filter(category =>
                category.toLowerCase().includes(focusedOption.value.toLowerCase())
            );

            await interaction.respond(
                filtered.map(choice => ({ name: choice, value: choice })).slice(0, 25)
            );
        }
        else if (focusedOption.name === "channels" || focusedOption.name === "exclude") {
            const channels = guild.channels.cache
                .filter(channel => channel.type === ChannelType.GuildText)
                .map(channel => channel.name);

            const searchValue = focusedOption.value.toLowerCase();
            const selectedChannels = searchValue.split(',').map(c => c.trim());
            const currentSearch = selectedChannels[selectedChannels.length - 1] || '';
            const prefix = selectedChannels.slice(0, -1).join(', ');
            const prefixAdd = prefix.length > 0 ? prefix + ', ' : '';

            const availableChannels = channels.filter(channel =>
                !selectedChannels.slice(0, -1).map(c => c.toLowerCase()).includes(channel.toLowerCase())
            );

            const filtered = availableChannels
                .filter(channel => channel.toLowerCase().includes(currentSearch.toLowerCase()))
                .map(channel => prefixAdd + channel);

            await interaction.respond(
                filtered.map(choice => ({ name: choice, value: choice })).slice(0, 25)
            );
        }
    },

    async execute(interaction: ChatInputCommandInteraction) {
        const client = interaction.client as ExtendedClient;
        const subcommand = interaction.options.getSubcommand();

        if (!interaction.guild) {
            return await interaction.reply({
                content: "This command can only be used in a server.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (subcommand === "set") {
            const topic = interaction.options.getString("topic", true);
            const targetChannel = (interaction.options.getChannel("channel") || interaction.channel) as TextChannel;

            if (!targetChannel.isTextBased()) {
                return await interaction.reply({
                    content: "Can only set topics for text channels!",
                    flags: MessageFlags.Ephemeral
                });
            }

            if (targetChannel.guildId !== interaction.guildId) {
                return await interaction.reply({
                    content: "You can only set topics for channels in this server!",
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                await targetChannel.setTopic(topic);

                const embed = new EmbedBuilder()
                    .setColor(Colors.Green)
                    .setTitle("✅ Topic Updated")
                    .addFields(
                        { name: "Channel", value: `${targetChannel}`, inline: true },
                        { name: "New Topic", value: topic || "*Empty topic*", inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                console.error("Error setting topic:", error);
                const errorEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle("❌ Error")
                    .setDescription("Failed to set channel topic.")
                    .setTimestamp();

                await interaction.reply({
                    embeds: [errorEmbed],
                    flags: MessageFlags.Ephemeral
                });
            }
        }
        else if (subcommand === "sync") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const topic = interaction.options.getString("topic", true);
            const category = interaction.options.getString("category");
            const channelsInput = interaction.options.getString("channels");
            const excludeInput = interaction.options.getString("exclude");
            const skipExisting = interaction.options.getBoolean("skip_existing") ?? false;

            let updated = 0;
            let skipped = 0;
            let failed = 0;
            let excluded = 0;

            const channels = await interaction.guild.channels.fetch();

            const targetChannelNames = channelsInput
                ? channelsInput.split(',').map(name => name.trim().toLowerCase())
                : null;

            const excludedChannelNames = excludeInput
                ? excludeInput.split(',').map(name => name.trim().toLowerCase())
                : [];

            const validChannels = Array.from(channels.values()).filter(channel => {
                if (!channel || !channel.isTextBased() || channel.type !== ChannelType.GuildText) {
                    return false;
                }

                if (category && channel.parent?.name.toLowerCase() !== category.toLowerCase()) {
                    return false;
                }

                if (excludedChannelNames.includes(channel.name.toLowerCase())) {
                    excluded++;
                    return false;
                }

                if (targetChannelNames && !targetChannelNames.includes(channel.name.toLowerCase())) {
                    return false;
                }

                if (skipExisting && (channel as TextChannel).topic) {
                    skipped++;
                    return false;
                }

                return true;
            });

            if (validChannels.length === 0) {
                return await interaction.editReply({
                    content: "No valid channels found matching the specified criteria."
                });
            }

            await Promise.all(
                validChannels.map(async channel => {
                    try {
                        const textChannel = channel as TextChannel;
                        await textChannel.setTopic(topic);
                        updated++;
                    } catch (err) {
                        console.error(`Failed to update topic in channel:`, err);
                        failed++;
                    }
                })
            );

            const channelList = validChannels
                .filter((c): c is TextChannel => c !== null)
                .map(c => `<#${c.id}>`)
                .join(", ");

            const embed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle("📝 Channel Topics Updated")
                .setDescription(topic)
                .addFields(
                    {
                        name: `Updated Channels (${updated})`,
                        value: channelList || "*No channels updated*"
                    }
                )
                .setTimestamp();

            const stats = [];
            if (excluded > 0) stats.push(`🚫 ${excluded} excluded`);
            if (skipped > 0) stats.push(`⏭️ ${skipped} skipped`);
            if (failed > 0) stats.push(`❌ ${failed} failed`);

            if (stats.length > 0) {
                embed.addFields({
                    name: "Statistics",
                    value: stats.join(" • ")
                });
            }

            const filters = [];
            if (category) filters.push(`📁 Category: \`${category}\``);
            if (channelsInput) filters.push(`📋 Included: \`${channelsInput}\``);
            if (excludeInput) filters.push(`⛔ Excluded: \`${excludeInput}\``);
            if (skipExisting) filters.push(`⏭️ Skipped existing topics`);

            if (filters.length > 0) {
                embed.addFields({
                    name: "Applied Filters",
                    value: filters.join("\n")
                });
            }

            await interaction.editReply({
                embeds: [embed]
            });
        }
    }
};
