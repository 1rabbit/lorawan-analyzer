import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

let db: DatabaseType | null = null;

export function initSQLite(dbPath: string): DatabaseType {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS gateways (
      gateway_id TEXT PRIMARY KEY,
      name TEXT,
      alias TEXT,
      group_name TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      latitude REAL,
      longitude REAL
    );

    CREATE TABLE IF NOT EXISTS custom_operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hide_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_type TEXT NOT NULL,
      prefix TEXT NOT NULL,
      description TEXT
    );
  `);

  // Migrate existing gateways table if columns are missing
  const cols = db.prepare('PRAGMA table_info(gateways)').all() as Array<{ name: string }>;
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('alias')) db.exec('ALTER TABLE gateways ADD COLUMN alias TEXT');
  if (!colNames.includes('group_name')) db.exec('ALTER TABLE gateways ADD COLUMN group_name TEXT');

  return db;
}

export function getSQLite(): DatabaseType {
  if (!db) {
    throw new Error('SQLite not initialized');
  }
  return db;
}

export function closeSQLite(): void {
  if (db) {
    db.close();
    db = null;
  }
}
