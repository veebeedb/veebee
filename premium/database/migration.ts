import { sql } from "../../cogs/core/database/database";

const existingUsers = sql<{ user_id: string; expires_at: number }>`
    SELECT user_id, expires_at FROM premium_users
`;

const existingServers = sql<{
  guild_id: string;
  added_by: string;
  added_at: number;
}>`
    SELECT guild_id, added_by, added_at FROM premium_servers
`;

const existingRoles = sql<{ guild_id: string; role_id: string }>`
    SELECT guild_id, role_id FROM premium_roles
`;

sql`DROP TABLE IF EXISTS premium_users`;
sql`DROP TABLE IF EXISTS premium_servers`;
sql`DROP TABLE IF EXISTS premium_roles`;

sql`
    CREATE TABLE premium_users (
        user_id TEXT PRIMARY KEY,
        expires_at INTEGER,
        started_at INTEGER NOT NULL,
        granted_by TEXT NOT NULL,
        is_permanent BOOLEAN DEFAULT FALSE,
        total_time INTEGER DEFAULT 0,
        times_extended INTEGER DEFAULT 0,
        last_extended_at INTEGER,
        last_extended_by TEXT
    )
`;

sql`
    CREATE TABLE premium_servers (
        guild_id TEXT PRIMARY KEY,
        added_by TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        expires_at INTEGER,
        is_permanent BOOLEAN DEFAULT FALSE,
        total_time INTEGER DEFAULT 0,
        times_extended INTEGER DEFAULT 0,
        last_extended_at INTEGER,
        last_extended_by TEXT
    )
`;

sql`
    CREATE TABLE premium_roles (
        guild_id TEXT,
        role_id TEXT,
        auto_sync BOOLEAN DEFAULT TRUE,
        added_by TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, role_id)
    )
`;

for (const user of existingUsers) {
  sql`
        INSERT INTO premium_users (
            user_id,
            expires_at,
            started_at,
            granted_by,
            is_permanent,
            total_time,
            times_extended
        ) VALUES (
            ${user.user_id},
            ${user.expires_at},
            ${Date.now()}, -- Current time as we don't have original start time
            'SYSTEM_MIGRATION',
            ${user.expires_at === null},
            ${user.expires_at ? user.expires_at - Date.now() : 0},
            0
        )
    `;
}

for (const server of existingServers) {
  sql`
        INSERT INTO premium_servers (
            guild_id,
            added_by,
            added_at,
            is_permanent,
            total_time,
            times_extended
        ) VALUES (
            ${server.guild_id},
            ${server.added_by},
            ${server.added_at},
            FALSE,
            ${Date.now() - server.added_at},
            0
        )
    `;
}

for (const role of existingRoles) {
  sql`
        INSERT INTO premium_roles (
            guild_id,
            role_id,
            auto_sync,
            added_by,
            added_at
        ) VALUES (
            ${role.guild_id},
            ${role.role_id},
            TRUE,
            'SYSTEM_MIGRATION',
            ${Date.now()}
        )
    `;
}
