import {
    ChatInputCommandInteraction,
    MessageFlags,
    GuildMember,
    Client,
    Role
} from "discord.js";
import { sql } from "../cogs/core/database/database";
import { PREMIUM_ROLE_IDS, PREMIUM_ROLE_ID, PREMIUM_GUILD_ID } from './constants';
import { logPremiumAction } from './database/init';

let client: Client;
let syncInterval: NodeJS.Timeout;

export function initializePremiumManager(discordClient: Client) {
    client = discordClient;
    clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        syncPremiumRoles(client).catch(error => {
            console.error('Error during automatic premium sync:', error);
        });
    }, 60 * 60 * 1000);

    syncPremiumRoles(client).catch(error => {
        console.error('Error during initial premium sync:', error);
    });
}

export async function addPremiumRole(guildId: string, roleId: string, addedBy: string) {
    if (!client) throw new Error('Premium manager not initialized');

    const guild = await client.guilds.fetch(guildId);
    const role = await guild.roles.fetch(roleId);
    const botMember = await guild.members.fetchMe();

    if (!role) {
        throw new Error('Role not found');
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
        throw new Error('Bot\'s role is not high enough to manage this role. The bot\'s highest role must be above the premium role.');
    }

    if (!botMember.permissions.has('ManageRoles')) {
        throw new Error('Bot does not have permission to manage roles.');
    }

    await sql`
        INSERT OR REPLACE INTO premium_roles (
            guild_id,
            role_id,
            added_by,
            added_at,
            auto_sync
        ) VALUES (
            ${guildId},
            ${roleId},
            ${addedBy},
            ${Date.now()},
            TRUE
        )
    `;

    await logPremiumAction(
        'ADD_ROLE',
        addedBy,
        `Added premium role ${roleId} to guild ${guildId}`,
        undefined,
        guildId,
        roleId
    );
}

export async function removePremiumRole(guildId: string, roleId: string, removedBy: string) {
    if (!client) throw new Error('Premium manager not initialized');

    const guild = await client.guilds.fetch(guildId);
    const role = await guild.roles.fetch(roleId);
    const botMember = await guild.members.fetchMe();

    if (!role) {
        await sql`DELETE FROM premium_roles WHERE guild_id = ${guildId} AND role_id = ${roleId}`;
        return;
    }

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
        throw new Error('Bot\'s role is not high enough to manage this role.');
    }

    if (!botMember.permissions.has('ManageRoles')) {
        throw new Error('Bot does not have permission to manage roles.');
    }

    await sql`DELETE FROM premium_roles WHERE guild_id = ${guildId} AND role_id = ${roleId}`;

    await logPremiumAction(
        'REMOVE_ROLE',
        removedBy,
        `Removed premium role ${roleId} from guild ${guildId}`,
        undefined,
        guildId,
        roleId
    );
}

export function getPremiumRoles(guildId: string): string[] {
    const roles = sql<{ role_id: string }>`
        SELECT role_id FROM premium_roles WHERE guild_id = ${guildId}
    `;
    return roles.map(r => r.role_id);
}

export async function canManageRole(guildId: string, roleId: string): Promise<{
    canManage: boolean;
    error?: string;
}> {
    if (!client) return { canManage: false, error: 'Premium manager not initialized' };

    try {
        const guild = await client.guilds.fetch(guildId);
        const role = await guild.roles.fetch(roleId);
        const botMember = await guild.members.fetchMe();

        if (!role) {
            return { canManage: false, error: 'Role not found' };
        }

        if (!botMember.permissions.has('ManageRoles')) {
            return { canManage: false, error: 'Bot does not have permission to manage roles' };
        }

        if (botMember.roles.highest.comparePositionTo(role) <= 0) {
            return {
                canManage: false,
                error: 'Bot\'s role is not high enough to manage this role. Move the bot\'s role above the premium role in the server settings.'
            };
        }

        return { canManage: true };
    } catch (error) {
        return {
            canManage: false,
            error: `Failed to check role permissions: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

export async function addPremiumUser(userId: string, durationDays: number = 30, grantedBy: string) {
    const timestamp = Date.now();
    const expiresAt = timestamp + (durationDays * 24 * 60 * 60 * 1000);

    await sql`
        INSERT OR REPLACE INTO premium_users (
            user_id,
            expires_at,
            started_at,
            granted_by,
            is_permanent,
            total_time,
            times_extended
        ) VALUES (
            ${userId},
            ${expiresAt},
            ${timestamp},
            ${grantedBy},
            FALSE,
            ${durationDays * 24 * 60 * 60 * 1000},
            1
        )
    `;

    logPremiumAction(
        'ADD_USER',
        grantedBy,
        `Added premium user ${userId} for ${durationDays} days`,
        userId,
        undefined,
        undefined
    );
}

export async function removePremiumUser(userId: string, removedBy: string) {
    await sql`DELETE FROM premium_users WHERE user_id = ${userId}`;

    logPremiumAction(
        'REMOVE_USER',
        removedBy,
        `Removed premium from user ${userId}`,
        userId,
        undefined,
        undefined
    );
}

export function isPremiumUser(userId: string): boolean {
    const user = sql<{ expires_at: number | null; is_permanent: boolean }>`
        SELECT expires_at, is_permanent
        FROM premium_users
        WHERE user_id = ${userId}
    `;

    if (!user[0]) return false;

    if (user[0].is_permanent) return true;

    const expiry = user[0].expires_at;
    if (!expiry) return false;

    const isPremium = expiry > Date.now();

    if (!isPremium) {
        logPremiumAction(
            'PREMIUM_EXPIRED',
            'SYSTEM',
            `Premium expired for user ${userId}`,
            userId,
            undefined,
            undefined
        );
    }

    return isPremium;
}

export async function hasPremiumAccess(member: GuildMember): Promise<boolean> {
    if (isPremiumServer(member.guild.id)) return true;

    if (member.guild.id === PREMIUM_GUILD_ID) {
        for (const roleId of PREMIUM_ROLE_IDS) {
            if (member.roles.cache.has(roleId)) {
                await checkAndRevokeNonRolePremium(member.id);
                return true;
            }
        }
    }

    const premiumRoles = getPremiumRoles(member.guild.id);
    if (member.roles.cache.some(role => premiumRoles.includes(role.id))) {
        await checkAndRevokeNonRolePremium(member.id);
        return true;
    }

    return isPremiumUser(member.id);
}

export async function addPremiumServer(guildId: string, addedBy: string, durationDays?: number) {
    const timestamp = Date.now();
    const expiresAt = durationDays ? timestamp + (durationDays * 24 * 60 * 60 * 1000) : null;

    await sql`
        INSERT OR REPLACE INTO premium_servers (
            guild_id,
            added_by,
            added_at,
            expires_at,
            is_permanent,
            total_time,
            times_extended
        ) VALUES (
            ${guildId},
            ${addedBy},
            ${timestamp},
            ${expiresAt},
            ${!durationDays},
            ${durationDays ? durationDays * 24 * 60 * 60 * 1000 : 0},
            1
        )
    `;

    logPremiumAction(
        'ADD_SERVER',
        addedBy,
        `Added premium to server ${guildId}${durationDays ? ` for ${durationDays} days` : ' permanently'}`,
        undefined,
        guildId,
        undefined
    );
}

export async function removePremiumServer(guildId: string, removedBy: string) {
    await sql`DELETE FROM premium_servers WHERE guild_id = ${guildId}`;

    logPremiumAction(
        'REMOVE_SERVER',
        removedBy,
        `Removed premium from server ${guildId}`,
        undefined,
        guildId,
        undefined
    );
}

export function isPremiumServer(guildId: string): boolean {
    const server = sql<{ expires_at: number | null; is_permanent: boolean }>`
        SELECT expires_at, is_permanent
        FROM premium_servers
        WHERE guild_id = ${guildId}
    `;

    if (!server[0]) return false;

    if (server[0].is_permanent) return true;

    const expiry = server[0].expires_at;
    if (!expiry) return false;

    const isPremium = expiry > Date.now();

    if (!isPremium) {
        logPremiumAction(
            'PREMIUM_EXPIRED',
            'SYSTEM',
            `Premium expired for server ${guildId}`,
            undefined,
            guildId,
            undefined
        );
    }

    return isPremium;
}

export function getPremiumServerInfo(guildId: string): {
    addedBy: string;
    addedAt: number;
    expiresAt: number | null;
    isPermanent: boolean;
    totalTime: number;
    timesExtended: number;
    lastExtendedAt: number | null;
    lastExtendedBy: string | null;
} | null {
    const info = sql<{
        added_by: string;
        added_at: number;
        expires_at: number | null;
        is_permanent: boolean;
        total_time: number;
        times_extended: number;
        last_extended_at: number | null;
        last_extended_by: string | null;
    }>`
        SELECT
            added_by,
            added_at,
            expires_at,
            is_permanent,
            total_time,
            times_extended,
            last_extended_at,
            last_extended_by
        FROM premium_servers
        WHERE guild_id = ${guildId}
    `;

    if (!info[0]) return null;

    return {
        addedBy: info[0].added_by,
        addedAt: info[0].added_at,
        expiresAt: info[0].expires_at,
        isPermanent: info[0].is_permanent,
        totalTime: info[0].total_time,
        timesExtended: info[0].times_extended,
        lastExtendedAt: info[0].last_extended_at,
        lastExtendedBy: info[0].last_extended_by
    };
}

export async function extendPremium(
    type: 'user' | 'server',
    targetId: string,
    durationDays: number,
    extendedBy: string
) {
    const timestamp = Date.now();

    if (type === 'user') {
        const currentUser = sql<{
            expires_at: number | null;
            total_time: number;
            times_extended: number;
        }>`SELECT expires_at, total_time, times_extended FROM premium_users WHERE user_id = ${targetId}`;

        if (!currentUser[0]) {
            throw new Error('User is not premium');
        }

        const newExpiryTime = (currentUser[0].expires_at || timestamp) + (durationDays * 24 * 60 * 60 * 1000);

        await sql`
            UPDATE premium_users 
            SET expires_at = ${newExpiryTime},
                total_time = ${currentUser[0].total_time + (durationDays * 24 * 60 * 60 * 1000)},
                times_extended = ${currentUser[0].times_extended + 1},
                last_extended_at = ${timestamp},
                last_extended_by = ${extendedBy}
            WHERE user_id = ${targetId}
        `;

        logPremiumAction(
            'EXTEND_USER',
            extendedBy,
            `Extended premium for user ${targetId} by ${durationDays} days`,
            targetId,
            undefined,
            undefined
        );
    } else {
        const currentServer = sql<{
            expires_at: number | null;
            total_time: number;
            times_extended: number;
        }>`SELECT expires_at, total_time, times_extended FROM premium_servers WHERE guild_id = ${targetId}`;

        if (!currentServer[0]) {
            throw new Error('Server is not premium');
        }

        const newExpiryTime = (currentServer[0].expires_at || timestamp) + (durationDays * 24 * 60 * 60 * 1000);

        await sql`
            UPDATE premium_servers
            SET expires_at = ${newExpiryTime},
                total_time = ${currentServer[0].total_time + (durationDays * 24 * 60 * 60 * 1000)},
                times_extended = ${currentServer[0].times_extended + 1},
                last_extended_at = ${timestamp},
                last_extended_by = ${extendedBy}
            WHERE guild_id = ${targetId}
        `;

        logPremiumAction(
            'EXTEND_SERVER',
            extendedBy,
            `Extended premium for server ${targetId} by ${durationDays} days`,
            undefined,
            targetId,
            undefined
        );
    }
}

export async function makePermanentPremium(
    type: 'user' | 'server',
    targetId: string,
    setBy: string
) {
    if (type === 'user') {
        await sql`
            UPDATE premium_users
            SET is_permanent = TRUE,
                expires_at = NULL
            WHERE user_id = ${targetId}
        `;

        logPremiumAction(
            'MAKE_PERMANENT_USER',
            setBy,
            `Made user ${targetId} permanently premium`,
            targetId,
            undefined,
            undefined
        );
    } else {
        await sql`
            UPDATE premium_servers
            SET is_permanent = TRUE,
                expires_at = NULL
            WHERE guild_id = ${targetId}
        `;

        logPremiumAction(
            'MAKE_PERMANENT_SERVER',
            setBy,
            `Made server ${targetId} permanently premium`,
            undefined,
            targetId,
            undefined
        );
    }
}

export async function checkAndRevokeNonRolePremium(userId: string): Promise<boolean> {
    if (!client) throw new Error('Premium manager not initialized');

    const guild = await client.guilds.fetch(PREMIUM_GUILD_ID);
    if (!guild) return false;

    let hasRolePremium = false;

    try {
        const member = await guild.members.fetch(userId);
        if (!member) return false;

        for (const roleId of PREMIUM_ROLE_IDS) {
            if (member.roles.cache.has(roleId)) {
                hasRolePremium = true;
                break;
            }
        }

        if (hasRolePremium) {
            await sql`DELETE FROM premium_users WHERE user_id = ${userId}`;
            logPremiumAction(
                'REVOKE_MANUAL_PREMIUM',
                'SYSTEM',
                `Revoked manual premium from user ${userId} (has role-based premium)`,
                userId,
                undefined,
                undefined
            );
        }

        return hasRolePremium;
    } catch (error) {
        console.error(`Error checking role premium for user ${userId}:`, error);
        return false;
    }
}

export async function syncPremiumRoles(client: Client) {
    const guild = client.guilds.cache.get(PREMIUM_GUILD_ID);
    if (!guild) {
        console.error('Premium guild not found');
        return;
    }

    try {
        const premiumRole = guild.roles.cache.get(PREMIUM_ROLE_ID);
        if (!premiumRole) {
            console.error('Premium role not found');
            return;
        }

        const rolePremiumIds = new Set<string>();
        for (const roleId of PREMIUM_ROLE_IDS) {
            const role = await guild.roles.fetch(roleId);
            if (role) {
                for (const [memberId] of role.members) {
                    rolePremiumIds.add(memberId);
                }
            }
        }

        const manualPremiumUsers = sql<{ user_id: string, expires_at: number }>`
            SELECT user_id, expires_at FROM premium_users
            WHERE expires_at > ${Date.now()}
        `;

        for (const { user_id } of manualPremiumUsers) {
            if (rolePremiumIds.has(user_id)) {
                await sql`DELETE FROM premium_users WHERE user_id = ${user_id}`;
                logPremiumAction(
                    'REVOKE_MANUAL_PREMIUM',
                    'SYSTEM',
                    `Revoked manual premium from user ${user_id} (has role-based premium)`,
                    user_id,
                    undefined,
                    undefined
                );
            }
        }

        const updatedPremiumUsers = sql<{ user_id: string }>`
            SELECT user_id FROM premium_users
            WHERE expires_at > ${Date.now()}
        `;

        const manualPremiumIds = new Set(updatedPremiumUsers.map(u => u.user_id));
        const allPremiumIds = new Set([...rolePremiumIds, ...manualPremiumIds]);

        const allUserIds = [...allPremiumIds];
        for (let i = 0; i < allUserIds.length; i += 100) {
            const chunkIds = allUserIds.slice(i, i + 100);
            try {
                const members = await guild.members.fetch({
                    user: chunkIds
                });

                for (const member of members.values()) {
                    if (!member.roles.cache.has(PREMIUM_ROLE_ID)) {
                        try {
                            await member.roles.add(PREMIUM_ROLE_ID);
                            console.log(`Added premium role to ${member.user.tag}`);
                        } catch (error) {
                            console.error(`Failed to add premium role to ${member.user.tag}:`, error);
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing member chunk:', error);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        for (const member of premiumRole.members.values()) {
            if (!allPremiumIds.has(member.id)) {
                try {
                    await member.roles.remove(PREMIUM_ROLE_ID);
                    console.log(`Removed premium role from ${member.user.tag} (no longer has premium)`);
                } catch (error) {
                    console.error(`Failed to remove premium role from ${member.user.tag}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error syncing premium roles:', error);
    }
}


// Middleware for checking premium status in commands
export async function requirePremium(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!interaction.inGuild() || !interaction.member) {
        await interaction.reply({
            content: "This premium feature must be used in a server.",
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    const member = interaction.member as GuildMember;
    const hasPremium = await hasPremiumAccess(member);

    if (!hasPremium) {
        await interaction.reply({
            content: "This feature requires premium access. Contact a server administrator for more information.",
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    return true;
}