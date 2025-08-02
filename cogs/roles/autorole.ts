import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const dbPath = join(process.cwd(), "data");
if (!existsSync(dbPath)) mkdirSync(dbPath);

const db = new Database(join(dbPath, "autorole.sqlite"));

db.run(`
  CREATE TABLE IF NOT EXISTS autorole (
    guildId TEXT PRIMARY KEY,
    roleId TEXT NOT NULL
  )
`);

export function setAutorole(guildId: string, roleId: string) {
  db.run(
    `INSERT INTO autorole (guildId, roleId) VALUES (?, ?)
     ON CONFLICT(guildId) DO UPDATE SET roleId = excluded.roleId`,
    [guildId, roleId]
  );
}

export function getAutorole(guildId: string): string | null {
  const row = db.prepare(`SELECT roleId FROM autorole WHERE guildId = ?`).get(guildId) as { roleId: string } | undefined;
  return row?.roleId ?? null;
}

export function deleteAutorole(guildId: string) {
  db.run(`DELETE FROM autorole WHERE guildId = ?`, [guildId]);
}
