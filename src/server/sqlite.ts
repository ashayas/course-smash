// The small part of the D1 API this app uses, on top of SQLite.
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

class Statement {
  constructor(readonly db: DatabaseSync, readonly sql: string, readonly params: SQLInputValue[] = []) {}

  bind(...params: SQLInputValue[]) {
    return new Statement(this.db, this.sql, params);
  }
  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null;
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
  }
  async run() {
    return { success: true, meta: { changes: Number(this.db.prepare(this.sql).run(...this.params).changes) } };
  }
}

export function openDatabase(path: string, migrationsDir: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");

  const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((row) => String(row.name)));
  for (const name of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(migrationsDir, name), "utf8"));
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(name, Date.now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    prepare: (sql: string) => new Statement(db, sql),
    // Like D1, a batch is one transaction.
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
