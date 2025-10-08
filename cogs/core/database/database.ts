import { Database } from "bun:sqlite";

const db = new Database("data.db");

export function sql<T = unknown>(
  strings: TemplateStringsArray,
  ...values: any[]
): T[] {
  const query = strings.reduce(
    (acc, str, i) => acc + str + (i < values.length ? "?" : ""),
    ""
  );
  const stmt = db.prepare(query);
  return stmt.all(...values) as T[];
}
