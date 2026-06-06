import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { getDataDir } from '../config/Config';

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;

  const dir = path.join(getDataDir(), 'sqlite');
  fs.mkdirSync(dir, { recursive: true });

  db = new DatabaseSync(path.join(dir, 'notifications.db'));

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      source     TEXT NOT NULL,
      url        TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export function initDb(): void {
  getDb();
}

export function hasNotification(id: string): boolean {
  const row = getDb().prepare('SELECT 1 AS found FROM notifications WHERE id = ?').get(id);
  return row !== undefined;
}

export function saveNotification(id: string, source: string, url: string): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO notifications (id, source, url) VALUES (?, ?, ?)')
    .run(id, source, url);
}
