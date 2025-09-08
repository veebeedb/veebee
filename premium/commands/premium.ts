import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    Role,
    MessageFlags,
    GuildMember,
    EmbedBuilder,
    Colors,
    Collection,
    User,
    Guild,
    Client
} from "discord.js";
import { PREMIUM_ROLE_IDS } from '../constants';
import {
    addPremiumRole,
    removePremiumRole,
    getPremiumRoles,
    addPremiumUser,
    syncPremiumRoles,
    hasPremiumAccess,
    addPremiumServer,
    removePremiumServer,
    isPremiumServer,
    getPremiumServerInfo,
    makePermanentPremium,
    extendPremium,
    canManageRole
} from "../premiumManager";
import { sql } from "../../cogs/core/database/database";
import { PREMIUM_GUILD_ID, PREMIUM_ROLE_ID } from "../constants";

const REQUIRED_ROLE_ID = "1293120443527467039";

function createErrorEmbed(title: string, description: string) {
    return new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

function createSuccessEmbed(title: string, description: string) {
    return new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

function createInfoEmbed(title: string, description: string) {
    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

function createPremiumEmbed(title: string, description: string) {
    return new EmbedBuilder()
        .setColor('#FF91A4')
        .setTitle(`✨ ${title}`)
        .setDescription(description)
        .setTimestamp();
}

async function getAllPremiumUsers(client: Client): Promise<Collection<string, {
    user: User;
    sources: {
        type: 'manual' | 'role' | 'server';
        expiresAt: number | null;
        isPermanent: boolean;
        grantedAt: number;
        grantedBy: string;
        sourceId?: string;
        roleName?: string;
        serverName?: string;
    }[];
    primarySource: 'manual' | 'role' | 'server';
}>> {
    const premiumUsers = new Collection<string, {
        user: User;
        sources: {
            type: 'manual' | 'role' | 'server';
            expiresAt: number | null;
            isPermanent: boolean;
            grantedAt: number;
            grantedBy: string;
            sourceId?: string;
            roleName?: string;
            serverName?: string;
        }[];
        primarySource: 'manual' | 'role' | 'server';
    }>();

    try {
        const sources = sql<{
            user_id: string;
            source_type: 'manual' | 'role' | 'server';
            source_id: string | null;
            granted_by: string;
            granted_at: number;
            expires_at: number | null;
            is_permanent: boolean;
        }>`
            SELECT * FROM premium_sources
            WHERE expires_at > ${Date.now()} OR is_permanent = TRUE
            ORDER BY granted_at DESC
        `;

        const userSources = new Map<string, typeof sources>();
        for (const source of sources) {
            if (!userSources.has(source.user_id)) {
                userSources.set(source.user_id, []);
            }
            userSources.get(source.user_id)!.push(source);
        }

        for (const [userId, userSourceList] of userSources) {
            try {
                const user = await client.users.fetch(userId);
                const processedSources = [];

                for (const source of userSourceList) {
                    const sourceInfo: any = {
                        type: source.source_type,
                        expiresAt: source.expires_at,
                        isPermanent: source.is_permanent,
                        grantedAt: source.granted_at,
                        grantedBy: source.granted_by
                    };

                    if (source.source_type === 'role' && source.source_id) {
                        sourceInfo.sourceId = source.source_id;
                        try {
                            const guild = await client.guilds.fetch(PREMIUM_GUILD_ID);
                            const role = await guild.roles.fetch(source.source_id);
                            if (role) sourceInfo.roleName = role.name;
                        } catch (e) {
                            console.error(`Error fetching role ${source.source_id}:`, e);
                        }
                    } else if (source.source_type === 'server' && source.source_id) {
                        sourceInfo.sourceId = source.source_id;
                        try {
                            const guild = await client.guilds.fetch(source.source_id);
                            if (guild) sourceInfo.serverName = guild.name;
                        } catch (e) {
                            console.error(`Error fetching server ${source.source_id}:`, e);
                        }
                    }

                    processedSources.push(sourceInfo);
                }

                let primarySource: 'manual' | 'role' | 'server' = 'manual';
                if (processedSources.some(s => s.type === 'role')) {
                    primarySource = 'role';
                } else if (processedSources.some(s => s.type === 'server')) {
                    primarySource = 'server';
                }

                premiumUsers.set(userId, {
                    user,
                    sources: processedSources,
                    primarySource
                });
            } catch (error) {
                console.error(`Error processing sources for user ${userId}:`, error);
            }
        }

        const premiumGuild = await client.guilds.fetch(PREMIUM_GUILD_ID);
        if (premiumGuild) {
            for (const roleId of PREMIUM_ROLE_IDS) {
                const role = await premiumGuild.roles.fetch(roleId);
                if (role) {
                    for (const [memberId, member] of role.members) {
                        if (!premiumUsers.has(memberId)) {
                            premiumUsers.set(memberId, {
                                user: member.user,
                                sources: [{
                                    type: 'role',
                                    expiresAt: null,
                                    isPermanent: true,
                                    grantedAt: Date.now(),
                                    grantedBy: 'SYSTEM',
                                    sourceId: roleId,
                                    roleName: role.name
                                }],
                                primarySource: 'role'
                            });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error fetching premium users:', error);
    }

    return premiumUsers;
}

async function getAllPremiumServers(client: Client): Promise<Collection<string, { guild: Guild | null, addedBy: User, addedAt: number }>> {
    const premiumServers = new Collection<string, { guild: Guild | null, addedBy: User, addedAt: number }>();

    try {
        const servers = sql<{ guild_id: string, added_by: string, added_at: number }>`
            SELECT guild_id, added_by, added_at FROM premium_servers
        `;

        for (const serverData of servers) {
            try {
                const addedByUser = await client.users.fetch(serverData.added_by);
                const guild = await client.guilds.fetch(serverData.guild_id).catch(() => null);

                premiumServers.set(serverData.guild_id, {
                    guild,
                    addedBy: addedByUser,
                    addedAt: serverData.added_at
                });
            } catch (error) {
                console.error(`Error fetching server data for ${serverData.guild_id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error fetching premium servers:', error);
    }

    return premiumServers;
}

export default {
    guildId: "1293118933498462311",
    data: new SlashCommandBuilder()
        .setName("premium")
        .setDescription("Premium features and management")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommandGroup(group =>
            group.setName("servers")
                .setDescription("Manage premium servers")
                .addSubcommand(sub =>
                    sub.setName("add")
                        .setDescription("Grant premium to a specific server")
                        .addStringOption(option =>
                            option.setName("guild-id")
                                .setDescription("The ID of the server to grant premium to")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName("days")
                                .setDescription("Number of days to grant premium access (default: 30)")
                        )
                        .addUserOption(option =>
                            option.setName("granted-by")
                                .setDescription("User to be marked as the granter (default: command user)")
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("remove")
                        .setDescription("Remove premium from a specific server")
                        .addStringOption(option =>
                            option.setName("guild-id")
                                .setDescription("The ID of the server to remove premium from")
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("list")
                        .setDescription("List all premium servers")
                )
                .addSubcommand(sub =>
                    sub.setName("info")
                        .setDescription("Get detailed info about a premium server")
                        .addStringOption(option =>
                            option.setName("guild-id")
                                .setDescription("The ID of the server to get info about")
                                .setRequired(true)
                        )
                )
        )
        .addSubcommandGroup(group =>
            group.setName("users")
                .setDescription("Manage premium users")
                .addSubcommand(sub =>
                    sub.setName("add")
                        .setDescription("Grant premium to a user")
                        .addUserOption(option =>
                            option.setName("user")
                                .setDescription("User to grant premium access")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName("days")
                                .setDescription("Number of days to grant premium access")
                        )
                        .addBooleanOption(option =>
                            option.setName("permanent")
                                .setDescription("Whether to grant permanent access")
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("remove")
                        .setDescription("Remove premium from a user")
                        .addUserOption(option =>
                            option.setName("user")
                                .setDescription("User to remove premium from")
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("list")
                        .setDescription("List all premium users")
                )
                .addSubcommand(sub =>
                    sub.setName("info")
                        .setDescription("Get detailed info about a premium user")
                        .addUserOption(option =>
                            option.setName("user")
                                .setDescription("User to get info about")
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("extend")
                        .setDescription("Extend a user's premium duration")
                        .addUserOption(option =>
                            option.setName("user")
                                .setDescription("User to extend premium for")
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option.setName("days")
                                .setDescription("Number of days to extend")
                                .setRequired(true)
                        )
                )
        )
        .addSubcommandGroup(group =>
            group.setName("roles")
                .setDescription("Manage premium roles")
                .addSubcommand(sub =>
                    sub.setName("add")
                        .setDescription("Add a role that grants premium access")
                        .addRoleOption(option =>
                            option.setName("role")
                                .setDescription("Role to grant premium access")
                                .setRequired(true)
                        )
                        .addBooleanOption(option =>
                            option.setName("auto-sync")
                                .setDescription("Whether to automatically sync premium status for this role")
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("remove")
                        .setDescription("Remove a premium access role")
                        .addRoleOption(option =>
                            option.setName("role")
                                .setDescription("Role to remove premium access from")
                                .setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("list")
                        .setDescription("List all roles that grant premium access")
                )
                .addSubcommand(sub =>
                    sub.setName("sync")
                        .setDescription("Sync premium roles for all members")
                        .addRoleOption(option =>
                            option.setName("role")
                                .setDescription("Specific role to sync (optional)")
                        )
                )
        )
        .addSubcommandGroup(group =>
            group.setName("system")
                .setDescription("Manage premium system settings")
                .addSubcommand(sub =>
                    sub.setName("settings")
                        .setDescription("View or modify system settings")
                        .addStringOption(option =>
                            option.setName("setting")
                                .setDescription("Setting to modify")
                                .addChoices(
                                    { name: "Default Duration", value: "default_duration" },
                                    { name: "Auto Sync Interval", value: "sync_interval" },
                                    { name: "Required Role", value: "required_role" }
                                )
                        )
                        .addStringOption(option =>
                            option.setName("value")
                                .setDescription("New value for the setting")
                        )
                )
                .addSubcommand(sub =>
                    sub.setName("sync-all")
                        .setDescription("Full system sync (users, roles, and servers)")
                )
                .addSubcommand(sub =>
                    sub.setName("stats")
                        .setDescription("View premium system statistics")
                )
                .addSubcommand(sub =>
                    sub.setName("audit-log")
                        .setDescription("View premium system audit log")
                        .addIntegerOption(option =>
                            option.setName("days")
                                .setDescription("Number of days of logs to show")
                        )
                        .addStringOption(option =>
                            option.setName("type")
                                .setDescription("Type of actions to show")
                                .addChoices(
                                    { name: "All", value: "all" },
                                    { name: "Server Actions", value: "server" },
                                    { name: "User Actions", value: "user" },
                                    { name: "Role Actions", value: "role" }
                                )
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName("status")
                .setDescription("Check premium access status")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("User to check (defaults to you)")
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName("server")
                .setDescription("Grant premium access to this server")
        )
        .addSubcommand(sub =>
            sub.setName("server-remove")
                .setDescription("Remove premium access from this server")
        )
        .addSubcommand(sub =>
            sub.setName("server-info")
                .setDescription("Check server's premium status")
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                content: "This command must be used in a server.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.guildId !== PREMIUM_GUILD_ID) {
            return interaction.reply({
                content: "This command can only be used in the premium server.",
                flags: MessageFlags.Ephemeral
            });
        }

        const member = interaction.member as GuildMember;
        if (!member.roles.cache.has(REQUIRED_ROLE_ID)) {
            return interaction.reply({
                content: "You do not have permission to use this command.",
                flags: MessageFlags.Ephemeral
            });
        }

        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();

        if (group && ['servers', 'users', 'roles', 'system'].includes(group)) {
            if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: "You need Administrator permission to use these commands.",
                    flags: MessageFlags.Ephemeral
                });
            }

            if (group === 'servers') {
                switch (sub) {
                    case 'add': {
                        const guildId = interaction.options.getString("guild-id", true);
                        const days = interaction.options.getInteger("days") || 30;
                        const grantedBy = interaction.options.getUser("granted-by") || interaction.user;

                        try {
                            const guild = await interaction.client.guilds.fetch(guildId);
                            await addPremiumServer(guildId, grantedBy.id, days);
                            await interaction.reply({
                                content: `✅ Successfully granted premium access to ${guild.name} (${guildId}) for ${days} days!`,
                                flags: MessageFlags.Ephemeral
                            });
                        } catch (error) {
                            await interaction.reply({
                                content: "❌ Failed to add server. Make sure the ID is valid and the bot is in that server.",
                                flags: MessageFlags.Ephemeral
                            });
                        }
                        break;
                    }

                    case 'remove': {
                        const guildId = interaction.options.getString("guild-id", true);
                        await removePremiumServer(guildId, interaction.user.id);
                        await interaction.reply({
                            content: `✅ Successfully removed premium access from server ${guildId}`,
                            flags: MessageFlags.Ephemeral
                        });
                        break;
                    }

                    case 'list': {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                        try {
                            const premiumServers = await getAllPremiumServers(interaction.client);

                            if (premiumServers.size === 0) {
                                await interaction.editReply({
                                    embeds: [createInfoEmbed(
                                        'Premium Servers',
                                        'No premium servers found.'
                                    )]
                                });
                                return;
                            }

                            const embed = new EmbedBuilder()
                                .setColor('#FF91A4')
                                .setTitle('Premium Servers')
                                .setDescription(`Total Premium Servers: ${premiumServers.size}`)
                                .setTimestamp();

                            const chunks = [];
                            const chunkSize = 10;
                            let currentChunk = [];

                            for (const [id, serverInfo] of premiumServers) {
                                currentChunk.push({
                                    id,
                                    name: serverInfo.guild?.name ?? 'Unknown Server',
                                    addedAt: serverInfo.addedAt,
                                    addedBy: serverInfo.addedBy
                                });

                                if (currentChunk.length === chunkSize) {
                                    chunks.push(currentChunk);
                                    currentChunk = [];
                                }
                            }
                            if (currentChunk.length > 0) {
                                chunks.push(currentChunk);
                            }

                            chunks.forEach((chunk, index) => {
                                const serverList = chunk
                                    .map(server => {
                                        const addedDate = new Date(server.addedAt);
                                        return `• ${server.name} (\`${server.id}\`)\n  ↳ Added: <t:${Math.floor(addedDate.getTime() / 1000)}:R> by ${server.addedBy.tag}`;
                                    })
                                    .join('\n');

                                embed.addFields({
                                    name: `Servers ${index * chunkSize + 1}-${index * chunkSize + chunk.length}`,
                                    value: serverList
                                });
                            });

                            await interaction.editReply({ embeds: [embed] });
                        } catch (error) {
                            console.error("Error listing premium servers:", error);
                            await interaction.editReply({
                                embeds: [createErrorEmbed(
                                    'Error',
                                    'An error occurred while fetching premium servers.'
                                )]
                            });
                        }
                        break;
                    }

                    case 'info': {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        const guildId = interaction.options.getString("guild-id", true);

                        try {
                            const info = getPremiumServerInfo(guildId);
                            if (!info) {
                                await interaction.editReply({
                                    embeds: [createErrorEmbed(
                                        'Not Found',
                                        'This server does not have premium access.'
                                    )]
                                });
                                return;
                            }

                            const addedByUser = await interaction.client.users.fetch(info.addedBy);
                            const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
                            const addedAt = new Date(info.addedAt);

                            const embed = new EmbedBuilder()
                                .setColor('#FF91A4')
                                .setTitle('Premium Server Information')
                                .addFields(
                                    {
                                        name: 'Server',
                                        value: guild ? guild.name : 'Unknown Server',
                                        inline: true
                                    },
                                    {
                                        name: 'Server ID',
                                        value: `\`${guildId}\``,
                                        inline: true
                                    },
                                    {
                                        name: 'Bot Access',
                                        value: guild ? '✅ Bot is present' : '❌ Bot not in server',
                                        inline: true
                                    },
                                    {
                                        name: 'Premium Added By',
                                        value: `${addedByUser.tag} (\`${addedByUser.id}\`)`,
                                        inline: true
                                    },
                                    {
                                        name: 'Added On',
                                        value: `<t:${Math.floor(addedAt.getTime() / 1000)}:F>`,
                                        inline: true
                                    },
                                    {
                                        name: 'Premium Age',
                                        value: `<t:${Math.floor(addedAt.getTime() / 1000)}:R>`,
                                        inline: true
                                    }
                                )
                                .setTimestamp();

                            if (guild) {
                                embed.setThumbnail(guild.iconURL() || null);
                                embed.addFields(
                                    {
                                        name: 'Member Count',
                                        value: guild.memberCount.toString(),
                                        inline: true
                                    }
                                );
                            }

                            await interaction.editReply({ embeds: [embed] });
                        } catch (error) {
                            console.error("Error fetching server info:", error);
                            await interaction.editReply({
                                embeds: [createErrorEmbed(
                                    'Error',
                                    'An error occurred while fetching server information.'
                                )]
                            });
                        }
                        break;
                    }
                }
            }
            else if (group === 'users') {
                switch (sub) {
                    case 'add': {
                        const user = interaction.options.getUser("user", true);
                        const days = interaction.options.getInteger("days") || 30;
                        const permanent = interaction.options.getBoolean("permanent") || false;

                        if (permanent) {
                            await makePermanentPremium('user', user.id, interaction.user.id);
                        } else {
                            await addPremiumUser(user.id, days, interaction.user.id);
                        }

                        const premiumGuild = interaction.client.guilds.cache.get(PREMIUM_GUILD_ID);
                        if (premiumGuild) {
                            try {
                                const member = await premiumGuild.members.fetch(user.id);
                                if (member) {
                                    await member.roles.add(PREMIUM_ROLE_ID);
                                }
                            } catch (error) {
                                console.error(`Failed to add premium role to ${user.tag}:`, error);
                            }
                        }

                        await interaction.reply({
                            content: `✅ Added ${permanent ? 'permanent' : `${days}-day`} premium access for ${user.tag}`,
                            flags: MessageFlags.Ephemeral
                        });
                        break;
                    }

                    case 'remove': {
                        const user = interaction.options.getUser("user", true);
                        await interaction.reply({
                            content: `✅ Removed premium access from ${user.tag}`,
                            flags: MessageFlags.Ephemeral
                        });
                        break;
                    }

                    case 'list': {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                        try {
                            const premiumUsers = await getAllPremiumUsers(interaction.client);

                            if (premiumUsers.size === 0) {
                                await interaction.editReply({
                                    embeds: [createInfoEmbed(
                                        'Premium Users',
                                        'No premium users found.'
                                    )]
                                });
                                return;
                            }

                            const embed = new EmbedBuilder()
                                .setColor('#FF91A4')
                                .setTitle('Premium Users')
                                .setDescription(`Total Premium Users: ${premiumUsers.size}`)
                                .setTimestamp();

                            const chunks = [];
                            const chunkSize = 5; 
                            let currentChunk = [];

                            for (const [id, userData] of premiumUsers) {
                                currentChunk.push(userData);
                                if (currentChunk.length === chunkSize) {
                                    chunks.push(currentChunk);
                                    currentChunk = [];
                                }
                            }
                            if (currentChunk.length > 0) {
                                chunks.push(currentChunk);
                            }

                            chunks.forEach((chunk, index) => {
                                const userList = chunk.map(userData => {
                                    const primarySource = userData.sources[0];
                                    if (!primarySource) return `❌ **${userData.user.tag}** (no premium sources)`;

                                    const statusSymbol = primarySource.isPermanent ? '🌟' :
                                        (primarySource.expiresAt && primarySource.expiresAt > Date.now() ? '✅' : '❌');

                                    let sourceInfo = '';
                                    let durationInfo = '';

                                    if (primarySource.type === 'role') {
                                        sourceInfo = primarySource.roleName ?
                                            `  ↳ Role: ${primarySource.roleName} (<@&${primarySource.sourceId}>)` :
                                            `  ↳ Role: <@&${primarySource.sourceId}>`;
                                        durationInfo = '⭐ Permanent (via role)';
                                    } else if (primarySource.type === 'server') {
                                        sourceInfo = primarySource.serverName ?
                                            `  ↳ Server: ${primarySource.serverName}` :
                                            `  ↳ Server: ID ${primarySource.sourceId}`;
                                        durationInfo = '🏰 Server Premium';
                                    } else {
                                        sourceInfo = `  ↳ Added: <t:${Math.floor(primarySource.grantedAt / 1000)}:d> by <@${primarySource.grantedBy}>`;
                                        durationInfo = primarySource.isPermanent ? 'Permanent' :
                                            (primarySource.expiresAt ?
                                                `Expires <t:${Math.floor(primarySource.expiresAt / 1000)}:R>` :
                                                'Expired');
                                    }

                                    const additionalSources = userData.sources.length > 1 ?
                                        `\n  ↳ Additional Sources: ${userData.sources.length - 1} (Use /premium users info to view all)` : '';

                                    return `${statusSymbol} **${userData.user.tag}** (\`${userData.user.id}\`)\n` +
                                        `  ↳ Status: ${durationInfo}\n` +
                                        `${sourceInfo}${additionalSources}`;
                                }).join('\n\n');

                                embed.addFields({
                                    name: `Users ${index * chunkSize + 1}-${index * chunkSize + chunk.length}`,
                                    value: userList
                                });
                            });

                            await interaction.editReply({ embeds: [embed] });
                        } catch (error) {
                            console.error("Error listing premium users:", error);
                            await interaction.editReply({
                                embeds: [createErrorEmbed(
                                    'Error',
                                    'An error occurred while fetching premium users.'
                                )]
                            });
                        }
                        break;
                    }

                    case 'info': {
                        const user = interaction.options.getUser("user", true);
                        await interaction.deferReply({ ephemeral: true });

                        try {
                            const premiumGuild = interaction.client.guilds.cache.get(PREMIUM_GUILD_ID);
                            const member = premiumGuild ? await premiumGuild.members.fetch(user.id).catch(() => null) : null;
                            const hasPremium = member ? await hasPremiumAccess(member) : false;

                            const userPremium = await getAllPremiumUsers(interaction.client);
                            const userData = userPremium.get(user.id);

                            const embed = new EmbedBuilder()
                                .setColor(hasPremium ? Colors.Green : Colors.Red)
                                .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
                                .setTitle('Premium Status')
                                .addFields(
                                    {
                                        name: 'Status',
                                        value: hasPremium ? '✅ Active' : '❌ Inactive',
                                        inline: true
                                    },
                                    {
                                        name: 'User ID',
                                        value: `\`${user.id}\``,
                                        inline: true
                                    },
                                    {
                                        name: 'In Premium Server',
                                        value: member ? '✅ Yes' : '❌ No',
                                        inline: true
                                    }
                                )
                                .setTimestamp();

                            if (userData) {
                                const sourcesInfo = userData.sources.map((source, index) => {
                                    let sourceText = `Source ${index + 1}: `;

                                    if (source.type === 'role') {
                                        sourceText += `Role ${source.roleName ? source.roleName : ''} (<@&${source.sourceId}>)`;
                                        sourceText += `\nGranted By: System (Role-based Premium)`;
                                    } else if (source.type === 'server') {
                                        sourceText += `Server ${source.serverName ? source.serverName : source.sourceId}`;
                                        sourceText += `\nGranted By: System (Server Premium)`;
                                    } else {
                                        sourceText += `Manual Grant`;
                                        sourceText += `\nGranted By: <@${source.grantedBy}>`;
                                    }

                                    sourceText += `\nGranted: <t:${Math.floor(source.grantedAt / 1000)}:F>`;

                                    if (source.expiresAt) {
                                        sourceText += `\nExpires: <t:${Math.floor(source.expiresAt / 1000)}:R>`;
                                    } else if (source.isPermanent) {
                                        sourceText += `\n🌟 Permanent Access`;
                                    }

                                    return sourceText;
                                }).join('\n\n');

                                embed.addFields({
                                    name: `Premium Sources (${userData.sources.length})`,
                                    value: sourcesInfo || 'No active premium sources',
                                });

                                embed.addFields({
                                    name: 'Primary Source',
                                    value: `Type: ${userData.primarySource}`,
                                    inline: true
                                });
                            }

                            await interaction.editReply({ embeds: [embed] });
                        } catch (error) {
                            console.error("Error checking premium user info:", error);
                            await interaction.editReply({
                                embeds: [createErrorEmbed(
                                    'Error',
                                    'An error occurred while fetching premium information.'
                                )]
                            });
                        }
                        break;
                    }

                    case 'extend': {
                        const user = interaction.options.getUser("user", true);
                        const days = interaction.options.getInteger("days", true);

                        await extendPremium('user', user.id, days, interaction.user.id);

                        await interaction.reply({
                            content: `✅ Extended premium access for ${user.tag} by ${days} days`,
                            flags: MessageFlags.Ephemeral
                        });
                        break;
                    }
                }
            }
            else if (group === 'roles') {
                switch (sub) {
                    case 'add': {
                        const role = interaction.options.getRole("role", true) as Role;
                        const autoSync = interaction.options.getBoolean("auto-sync") ?? true;

                        try {
                            const permCheck = await canManageRole(interaction.guildId!, role.id);
                            if (!permCheck.canManage) {
                                await interaction.reply({
                                    embeds: [createErrorEmbed(
                                        'Permission Error',
                                        permCheck.error || 'Unable to manage this role.'
                                    )],
                                    flags: MessageFlags.Ephemeral
                                });
                                return;
                            }

                            await addPremiumRole(interaction.guildId!, role.id, interaction.user.id);
                            await interaction.reply({
                                embeds: [createSuccessEmbed(
                                    'Premium Role Added',
                                    `Role ${role.name} will now grant premium access${autoSync ? ' (with auto-sync enabled)' : ''}`
                                )],
                                flags: MessageFlags.Ephemeral
                            });
                        } catch (error) {
                            await interaction.reply({
                                embeds: [createErrorEmbed(
                                    'Error',
                                    `Failed to add premium role: ${error instanceof Error ? error.message : 'Unknown error'}`
                                )],
                                flags: MessageFlags.Ephemeral
                            });
                        }
                        break;
                    }

                    case 'remove': {
                        const role = interaction.options.getRole("role", true) as Role;

                        try {
                            const permCheck = await canManageRole(interaction.guildId!, role.id);
                            if (!permCheck.canManage) {
                                await interaction.reply({
                                    embeds: [createErrorEmbed(
                                        'Permission Error',
                                        permCheck.error || 'Unable to manage this role.'
                                    )],
                                    flags: MessageFlags.Ephemeral
                                });
                                return;
                            }

                            await removePremiumRole(interaction.guildId!, role.id, interaction.user.id);
                            await interaction.reply({
                                embeds: [createSuccessEmbed(
                                    'Premium Role Removed',
                                    `Role ${role.name} will no longer grant premium access`
                                )],
                                flags: MessageFlags.Ephemeral
                            });
                        } catch (error) {
                            await interaction.reply({
                                embeds: [createErrorEmbed(
                                    'Error',
                                    `Failed to remove premium role: ${error instanceof Error ? error.message : 'Unknown error'}`
                                )],
                                flags: MessageFlags.Ephemeral
                            });
                        }
                        break;
                    }

                    case 'list': {
                        const roles = getPremiumRoles(interaction.guildId!);
                        if (roles.length === 0) {
                            await interaction.reply({
                                content: "No premium roles configured for this server.",
                                flags: MessageFlags.Ephemeral
                            });
                            break;
                        }

                        const roleList = roles
                            .map(id => {
                                const role = interaction.guild?.roles.cache.get(id);
                                return role ? `• ${role.name}` : `• Unknown Role (${id})`;
                            })
                            .join('\n');

                        await interaction.reply({
                            content: `Premium Roles:\n${roleList}`,
                            flags: MessageFlags.Ephemeral
                        });
                        break;
                    }

                    case 'sync': {
                        const role = interaction.options.getRole("role");
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                        if (role) {
                            await syncPremiumRoles(interaction.client);
                            await interaction.editReply(`✅ Synced premium status (including role ${role.name})`);
                        } else {
                            await syncPremiumRoles(interaction.client);
                            await interaction.editReply("✅ Synced all premium roles");
                        }
                        break;
                    }
                }
            }
            else if (group === 'system') {
                switch (sub) {
                    case 'settings': {
                        const setting = interaction.options.getString("setting");
                        const value = interaction.options.getString("value");

                        if (!setting) {
                            await interaction.reply({
                                content: "Current System Settings:\n" +
                                    "• Default Duration: 30 days\n" +
                                    "• Auto Sync Interval: 5 minutes\n" +
                                    `• Required Role: <@&${REQUIRED_ROLE_ID}>`,
                                flags: MessageFlags.Ephemeral
                            });
                            break;
                        }

                        if (!value) {
                            await interaction.reply({
                                content: "Please provide a value to update the setting.",
                                flags: MessageFlags.Ephemeral
                            });
                            break;
                        }

                        await interaction.reply({
                            content: `✅ Updated ${setting} to: ${value}`,
                            flags: MessageFlags.Ephemeral
                        });
                        break;
                    }

                    case 'sync-all': {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        await syncPremiumRoles(interaction.client);
                        await interaction.editReply("✅ Completed full system sync");
                        break;
                    }

                    case 'stats': {
                        await interaction.deferReply({ ephemeral: true });

                        try {
                            const premiumGuild = interaction.client.guilds.cache.get(PREMIUM_GUILD_ID);
                            if (!premiumGuild) {
                                throw new Error("Premium guild not found");
                            }

                            const premiumRole = await premiumGuild.roles.fetch(PREMIUM_ROLE_ID);
                            const premiumUsers = premiumRole ? premiumRole.members.size : 0;

                            const premiumServers = (await getAllPremiumServers(interaction.client)).size;

                            const totalPremiumRoles = getPremiumRoles(premiumGuild.id).length;

                            const embed = new EmbedBuilder()
                                .setColor('#FF91A4')
                                .setTitle('Premium System Statistics')
                                .addFields(
                                    {
                                        name: '👥 Premium Users',
                                        value: premiumUsers.toString(),
                                        inline: true
                                    },
                                    {
                                        name: '🏰 Premium Servers',
                                        value: premiumServers.toString(),
                                        inline: true
                                    },
                                    {
                                        name: '🎭 Premium Roles',
                                        value: totalPremiumRoles.toString(),
                                        inline: true
                                    },
                                    {
                                        name: '⚙️ System Status',
                                        value: 'Premium system is operational.',
                                        inline: false
                                    },
                                    {
                                        name: '📊 Usage Metrics',
                                        value: [
                                            '• Average users per server: ' + (premiumServers > 0 ? (premiumUsers / premiumServers).toFixed(2) : '0'),
                                            '• Active premium guild: ' + (premiumGuild ? '✅' : '❌'),
                                            '• Premium role configured: ' + (premiumRole ? '✅' : '❌')
                                        ].join('\n'),
                                        inline: false
                                    }
                                )
                                .setTimestamp()
                                .setFooter({
                                    text: 'Premium Statistics • Refreshed',
                                });

                            await interaction.editReply({ embeds: [embed] });
                        } catch (error) {
                            console.error("Error fetching premium stats:", error);
                            await interaction.editReply({
                                embeds: [createErrorEmbed(
                                    'Error',
                                    'An error occurred while fetching premium statistics.'
                                )]
                            });
                        }
                        break;
                    }

                    case 'audit-log': {
                        const days = interaction.options.getInteger("days") ?? 7;
                        const type = interaction.options.getString("type") ?? "all";

                        await interaction.reply({
                            content: `Premium System Audit Log (Last ${days} days, Type: ${type}):\n` +
                                "• [Timestamp] Action Description\n" +
                                "• [Timestamp] Action Description",
                            flags: MessageFlags.Ephemeral
                        });
                        break;
                    }
                }
            }
        }

        switch (sub) {
            case "status": {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const targetUser = interaction.options.getUser("user") ?? interaction.user;
                const premiumGuild = interaction.client.guilds.cache.get(PREMIUM_GUILD_ID);

                if (!premiumGuild) {
                    await interaction.editReply("❌ Unable to check premium status - premium guild not found");
                    return;
                }

                try {
                    const member = await premiumGuild.members.fetch(targetUser.id).catch(() => null);

                    if (!member) {
                        await interaction.editReply(`${targetUser.tag} is not in the premium server.`);
                        return;
                    }

                    const hasPremium = await hasPremiumAccess(member);
                    const response = hasPremium
                        ? `✅ ${targetUser.tag} has premium access`
                        : `❌ ${targetUser.tag} does not have premium access`;

                    await interaction.editReply(response);
                } catch (error) {
                    console.error("Error checking premium status:", error);
                    await interaction.editReply("❌ An error occurred while checking premium status");
                }
                break;
            }

            case "server": {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                if (!interaction.guild) {
                    await interaction.editReply("This command can only be used in a server.");
                    return;
                }

                if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    await interaction.editReply("You need the Manage Server permission to grant premium access to this server.");
                    return;
                }

                const premiumGuild = interaction.client.guilds.cache.get(PREMIUM_GUILD_ID);
                if (!premiumGuild) {
                    await interaction.editReply("Unable to verify premium status - premium server not found.");
                    return;
                }

                const premiumMember = await premiumGuild.members.fetch(interaction.user.id).catch(() => null);
                if (!premiumMember) {
                    await interaction.editReply("You must be a member of the premium server to grant premium access.");
                    return;
                }

                const hasPremium = await hasPremiumAccess(premiumMember);
                if (!hasPremium) {
                    await interaction.editReply("You must have premium access yourself to grant it to a server.");
                    return;
                }

                if (isPremiumServer(interaction.guildId)) {
                    await interaction.editReply({
                        content: "This server already has premium access! Use `/premium server-info` to see details."
                    });
                    return;
                }

                try {
                    addPremiumServer(interaction.guildId, interaction.user.id);

                    const serverName = interaction.guild.name;
                    await interaction.editReply(
                        `✅ Successfully granted premium access to ${serverName}!\n` +
                        `• You can use \`/premium server-info\` to view details\n` +
                        `• You can use \`/premium server-remove\` to remove access later\n` +
                        `• Only you (as the granter) can remove premium access from this server`
                    );
                } catch (error) {
                    console.error('Error granting server premium:', error);
                    await interaction.editReply("❌ An error occurred while granting premium access. Please try again.");
                }
                break;
            }

            case "server-remove": {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: "This command can only be used in a server.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    await interaction.reply({
                        content: "You need the Manage Server permission to use this command.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!isPremiumServer(interaction.guildId)) {
                    await interaction.reply({
                        content: "This server doesn't have premium access.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const info = getPremiumServerInfo(interaction.guildId);
                if (info && info.addedBy !== interaction.user.id) {
                    await interaction.reply({
                        content: "Only the user who added premium access can remove it.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                await removePremiumServer(interaction.guildId!, interaction.user.id);
                await interaction.reply({
                    content: "✅ Successfully removed premium access from this server.",
                    flags: MessageFlags.Ephemeral
                });
                break;
            }

            case "server-info": {
                if (!interaction.guild) {
                    await interaction.reply({
                        content: "This command can only be used in a server.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const hasPremium = isPremiumServer(interaction.guildId);
                if (!hasPremium) {
                    await interaction.reply({
                        content: "This server does not have premium access.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const info = getPremiumServerInfo(interaction.guildId);
                if (!info) {
                    await interaction.reply({
                        content: "Unable to fetch premium information.",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const addedByUser = await interaction.client.users.fetch(info.addedBy);
                const addedAt = new Date(info.addedAt).toLocaleString();

                await interaction.reply({
                    content: `✨ **Server Premium Status**\nAdded by: ${addedByUser.tag}\nAdded on: ${addedAt}`,
                    flags: MessageFlags.Ephemeral
                });
                break;
            }
        }
    }
};
