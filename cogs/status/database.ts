import { sql } from "../core/database/database";

try {
  sql`
    CREATE TABLE IF NOT EXISTS status_configs (
        guildId TEXT NOT NULL,
        serviceType TEXT NOT NULL,
        url TEXT NOT NULL,
        apiKey TEXT,
        channelId TEXT,
        updateInterval INTEGER DEFAULT 300,
        enabled INTEGER DEFAULT 1,
        lastChecked INTEGER,
        PRIMARY KEY (guildId, serviceType)
    );
    `;
} catch (error) {
  console.error(error);
}

export interface StatusConfig {
  guildId: string;
  serviceType: string;
  url: string;
  apiKey?: string;
  channelId?: string;
  updateInterval: number;
  enabled: boolean;
  lastChecked?: number;
}

export async function getStatusConfig(
  guildId: string,
  serviceType: string
): Promise<StatusConfig | null> {
  const result = sql<StatusConfig>`
        SELECT * FROM status_configs 
        WHERE guildId = ${guildId} 
        AND serviceType = ${serviceType}
    `;
  return result[0] || null;
}

export async function getAllStatusConfigs(
  guildId: string
): Promise<StatusConfig[]> {
  const result = sql<StatusConfig>`
        SELECT * FROM status_configs 
        WHERE guildId = ${guildId}
    `;
  return result;
}

export async function setStatusConfig(config: StatusConfig): Promise<void> {
  await sql`
        INSERT INTO status_configs (
            guildId, serviceType, url, apiKey, channelId, 
            updateInterval, enabled, lastChecked
        ) VALUES (
            ${config.guildId}, ${config.serviceType}, ${config.url}, 
            ${config.apiKey}, ${config.channelId}, ${config.updateInterval}, 
            ${config.enabled ? 1 : 0}, ${config.lastChecked}
        )
        ON CONFLICT (guildId, serviceType) DO UPDATE SET
            url = ${config.url},
            apiKey = ${config.apiKey},
            channelId = ${config.channelId},
            updateInterval = ${config.updateInterval},
            enabled = ${config.enabled ? 1 : 0},
            lastChecked = ${config.lastChecked}
    `;
}

export async function deleteStatusConfig(
  guildId: string,
  serviceType: string
): Promise<void> {
  await sql`
        DELETE FROM status_configs 
        WHERE guildId = ${guildId} 
        AND serviceType = ${serviceType}
    `;
}

export async function updateLastChecked(
  guildId: string,
  serviceType: string
): Promise<void> {
  await sql`
        UPDATE status_configs 
        SET lastChecked = ${Date.now()} 
        WHERE guildId = ${guildId} 
        AND serviceType = ${serviceType}
    `;
}
