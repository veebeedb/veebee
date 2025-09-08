import { sql } from "../../cogs/core/database/database";

sql`
    CREATE TABLE IF NOT EXISTS premium_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        user_id TEXT,
        guild_id TEXT,
        role_id TEXT,
        performed_by TEXT NOT NULL,
        details TEXT
    )
`;

sql`
    CREATE TABLE IF NOT EXISTS premium_users (
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
    CREATE TABLE IF NOT EXISTS premium_servers (
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
    CREATE TABLE IF NOT EXISTS premium_roles (
        guild_id TEXT,
        role_id TEXT,
        auto_sync BOOLEAN DEFAULT TRUE,
        added_by TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, role_id)
    )
`;

const existingSourcesTable = sql<{ name: string }>`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='premium_sources'
`;

if (existingSourcesTable.length > 0) {
  const hasIndex = sql<{ name: string }>`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name='idx_premium_sources_unique'
    `;

  if (hasIndex.length === 0) {
    console.log("[DB] Migrating premium_sources table to fixed schema...");

    sql`ALTER TABLE premium_sources RENAME TO premium_sources_old`;

    sql`
            CREATE TABLE premium_sources (
                user_id TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id TEXT,
                granted_by TEXT NOT NULL,
                granted_at INTEGER NOT NULL,
                expires_at INTEGER,
                is_permanent BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (user_id, source_type, source_id)
            )
        `;

    sql`
            INSERT INTO premium_sources (
                user_id, source_type, source_id, granted_by,
                granted_at, expires_at, is_permanent
            )
            SELECT 
                user_id, source_type, source_id, granted_by,
                granted_at, expires_at, is_permanent
            FROM premium_sources_old
        `;

    sql`DROP TABLE premium_sources_old`;

    sql`
            CREATE UNIQUE INDEX idx_premium_sources_unique
            ON premium_sources (user_id, source_type, COALESCE(source_id, ''))
        `;

    console.log("[DB] premium_sources table migrated successfully.");
  }
} else {
  sql`
        CREATE TABLE IF NOT EXISTS premium_sources (
            user_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_id TEXT,
            granted_by TEXT NOT NULL,
            granted_at INTEGER NOT NULL,
            expires_at INTEGER,
            is_permanent BOOLEAN DEFAULT FALSE,
            PRIMARY KEY (user_id, source_type, source_id)
        )
    `;
  sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_sources_unique
        ON premium_sources (user_id, source_type, COALESCE(source_id, ''))
    `;
}

export function logPremiumAction(
  actionType: string,
  performedBy: string,
  details: string,
  userId?: string,
  guildId?: string,
  roleId?: string
) {
  sql`
        INSERT INTO premium_audit_log (
            timestamp,
            action_type,
            user_id,
            guild_id,
            role_id,
            performed_by,
            details
        ) VALUES (
            ${Date.now()},
            ${actionType},
            ${userId || null},
            ${guildId || null},
            ${roleId || null},
            ${performedBy},
            ${details}
        )
    `;
}

export function getPremiumAuditLog(
  days: number = 7,
  type: string = "all"
): {
  timestamp: number;
  action_type: string;
  user_id: string | null;
  guild_id: string | null;
  role_id: string | null;
  performed_by: string;
  details: string;
}[] {
  const timestamp = Date.now() - days * 24 * 60 * 60 * 1000;

  if (type === "all") {
    return sql`
            SELECT * FROM premium_audit_log
            WHERE timestamp >= ${timestamp}
            ORDER BY timestamp DESC
        `;
  }

  return sql`
        SELECT * FROM premium_audit_log
        WHERE timestamp >= ${timestamp}
        AND action_type LIKE ${`${type}%`}
        ORDER BY timestamp DESC
    `;
}

export function getPremiumStats() {
  const stats = {
    totalUsers: 0,
    activeUsers: 0,
    permanentUsers: 0,
    totalServers: 0,
    activeServers: 0,
    permanentServers: 0,
    totalRoles: 0,
    autoSyncRoles: 0,
    avgUserDuration: 0,
    avgServerDuration: 0,
  };

  const userStats = sql<{
    total: number;
    active: number;
    permanent: number;
    avg_duration: number;
  }>`
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN expires_at > ${Date.now()} OR is_permanent THEN 1 END) as active,
            COUNT(CASE WHEN is_permanent THEN 1 END) as permanent,
            AVG(total_time) as avg_duration
        FROM premium_users
    `;

  if (userStats[0]) {
    stats.totalUsers = userStats[0].total;
    stats.activeUsers = userStats[0].active;
    stats.permanentUsers = userStats[0].permanent;
    stats.avgUserDuration = userStats[0].avg_duration || 0;
  }

  const serverStats = sql<{
    total: number;
    active: number;
    permanent: number;
    avg_duration: number;
  }>`
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN expires_at > ${Date.now()} OR is_permanent THEN 1 END) as active,
            COUNT(CASE WHEN is_permanent THEN 1 END) as permanent,
            AVG(total_time) as avg_duration
        FROM premium_servers
    `;

  if (serverStats[0]) {
    stats.totalServers = serverStats[0].total;
    stats.activeServers = serverStats[0].active;
    stats.permanentServers = serverStats[0].permanent;
    stats.avgServerDuration = serverStats[0].avg_duration || 0;
  }

  const roleStats = sql<{
    total: number;
    auto_sync: number;
  }>`
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN auto_sync THEN 1 END) as auto_sync
        FROM premium_roles
    `;

  if (roleStats[0]) {
    stats.totalRoles = roleStats[0].total;
    stats.autoSyncRoles = roleStats[0].auto_sync;
  }

  return stats;
}
