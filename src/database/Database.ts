import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as fs from 'fs';
import { getDataDir } from '../config/Config';
import { PropertyAd, adKey, contentFingerprint } from '../models/PropertyAd';

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;

  const dir = path.join(getDataDir(), 'sqlite');
  fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, 'notifications.db'));

  // Legacy table kept for backward compatibility / historical dedup.
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, source TEXT, url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Rich ad store: one row per (source, external_id).
  db.exec(`
    CREATE TABLE IF NOT EXISTS ads (
      key          TEXT PRIMARY KEY,   -- source:externalId
      source       TEXT NOT NULL,
      external_id  TEXT NOT NULL,
      url          TEXT NOT NULL,
      fingerprint  TEXT NOT NULL,
      price        INTEGER,
      rooms        REAL,
      city         TEXT,
      neighborhood TEXT,
      street       TEXT,
      score        INTEGER,
      profile      TEXT,
      notified_at  TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ads_fingerprint ON ads(fingerprint)`);

  return db;
}

export function initDb(): void {
  getDb();
}

/** A repost carrying a *different* externalId but identical content. */
export function fingerprintSeen(fingerprint: string): boolean {
  return getDb().prepare('SELECT 1 FROM ads WHERE fingerprint = ?').get(fingerprint) !== undefined;
}

export interface NotifyDecision {
  /** 'new' | 'update' | 'skip' */
  kind: 'new' | 'update' | 'skip';
  /** Previous price, present when kind === 'update'. */
  previousPrice?: number;
}

/**
 * Decide whether an ad warrants a notification:
 *  - unseen key & unseen fingerprint        → 'new'
 *  - known key, price dropped               → 'update'
 *  - known key/fingerprint, no real change  → 'skip'
 */
export function classifyAd(ad: PropertyAd): NotifyDecision {
  const fp = contentFingerprint(ad);
  const key = adKey(ad);
  const row = getDb()
    .prepare('SELECT price FROM ads WHERE key = ?')
    .get(key) as { price: number | null } | undefined;

  if (!row) {
    if (fingerprintSeen(fp)) return { kind: 'skip' }; // repost of an ad we already sent
    return { kind: 'new' };
  }

  if (ad.price != null && row.price != null && ad.price < row.price) {
    return { kind: 'update', previousPrice: row.price };
  }
  return { kind: 'skip' };
}

/** Insert or update the stored record after a notification is sent. */
export function upsertAd(ad: PropertyAd, score: number, profile: string): void {
  const fp = contentFingerprint(ad);
  getDb()
    .prepare(
      `INSERT INTO ads
        (key, source, external_id, url, fingerprint, price, rooms, city, neighborhood, street, score, profile, notified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         url=excluded.url, fingerprint=excluded.fingerprint, price=excluded.price,
         rooms=excluded.rooms, score=excluded.score, updated_at=datetime('now')`
    )
    .run(
      adKey(ad), ad.source, ad.externalId, ad.url, fp,
      ad.price ?? null, ad.rooms ?? null,
      ad.city ?? null, ad.neighborhood ?? null, ad.street ?? null,
      score, profile
    );
}

// ---- Legacy helpers (still used by any old code paths) ---------------------
export function hasNotification(id: string): boolean {
  return getDb().prepare('SELECT 1 FROM notifications WHERE id = ?').get(id) !== undefined;
}
export function saveNotification(id: string, source: string, url: string): void {
  getDb().prepare('INSERT OR IGNORE INTO notifications (id, source, url) VALUES (?, ?, ?)').run(id, source, url);
}
