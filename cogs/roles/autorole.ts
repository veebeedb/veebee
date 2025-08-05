import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

interface AutoroleRecord {
  guildId: string;
  roleId: string;
}

const dbPath = join(process.cwd(), "data");
if (!existsSync(dbPath)) mkdirSync(dbPath, { recursive: true });

const db = new Database(join(dbPath, "autorole.sqlite"));

function initializeDatabase() {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS autorole (
        guildId TEXT PRIMARY KEY,
        roleId TEXT NOT NULL
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_guildId ON autorole(guildId)`);
  } catch (error) {
    console.error("[Autorole] Failed to initialize database:", error);
    throw error;
  }
}

initializeDatabase();

export function setAutorole(guildId: string, roleId: string): boolean {
  try {
    db.run(
      `INSERT INTO autorole (guildId, roleId) VALUES (?, ?)
       ON CONFLICT(guildId) DO UPDATE SET roleId = excluded.roleId`,
      [guildId, roleId]
    );
    return true;
  } catch (error) {
    console.error(`[Autorole] Failed to set autorole for guild ${guildId}:`, error);
    return false;
  }
}

export function getAutorole(guildId: string): string | null {
  try {
    const row = db.prepare(`SELECT roleId FROM autorole WHERE guildId = ?`).get(guildId) as { roleId: string } | undefined;
    return row?.roleId ?? null;
  } catch (error) {
    console.error(`[Autorole] Failed to get autorole for guild ${guildId}:`, error);
    return null;
  }
}

export function deleteAutorole(guildId: string): boolean {
  try {
    db.run(`DELETE FROM autorole WHERE guildId = ?`, [guildId]);
    return true;
  } catch (error) {
    console.error(`[Autorole] Failed to delete autorole for guild ${guildId}:`, error);
    return false;
  }
}

export function getAllAutoroles(): AutoroleRecord[] {
  try {
    return db.prepare(`SELECT guildId, roleId FROM autorole`).all() as AutoroleRecord[];
  } catch (error) {
    console.error("[Autorole] Failed to get all autoroles:", error);
    return [];
  }
}

export function clearAllAutoroles(): number {
  try {
    const result = db.run(`DELETE FROM autorole`);
    return result.changes ?? 0;
  } catch (error) {
    console.error("[Autorole] Failed to clear all autoroles:", error);
    return 0;
  }
}

process.on('exit', () => {
  try {
    db.close();
  } catch (error) {
    console.error("[Autorole] Failed to close database:", error);
  }
});