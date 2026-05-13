/**
 * SQLite-backed cache and site profile store.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { getConfig, initDataDir } from '../core/config.js';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dir = initDataDir();
    db = new Database(join(dir, 'agentic-browser.db'));
    db.pragma('journal_mode = WAL');
    createTables(db);
  }
  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_cache (
      url_hash TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      content TEXT,
      title TEXT,
      source TEXT,
      confidence REAL,
      created_at INTEGER,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS site_profiles (
      domain TEXT PRIMARY KEY,
      best_read_method TEXT,
      content_selector TEXT,
      login_required INTEGER DEFAULT 0,
      challenge_type TEXT,
      avg_load_time INTEGER,
      success_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      last_visited INTEGER,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_content_cache_expires ON content_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_site_profiles_domain ON site_profiles(domain);
  `);
}

// Content cache operations

export function getCachedContent(url: string): { content: string; title: string; source: string; confidence: number } | null {
  const db = getDb();
  const hash = hashUrl(url);
  const row = db.prepare(
    'SELECT content, title, source, confidence FROM content_cache WHERE url_hash = ? AND expires_at > ?'
  ).get(hash, Date.now()) as any;

  return row || null;
}

export function setCachedContent(
  url: string,
  content: string,
  title: string,
  source: string,
  confidence: number,
  ttlMs = 3600000, // 1 hour default
): void {
  const db = getDb();
  const hash = hashUrl(url);
  db.prepare(`
    INSERT OR REPLACE INTO content_cache (url_hash, url, content, title, source, confidence, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(hash, url, content, title, source, confidence, Date.now(), Date.now() + ttlMs);
}

// Site profile operations

export interface SiteProfile {
  domain: string;
  bestReadMethod?: string;
  contentSelector?: string;
  loginRequired: boolean;
  challengeType?: string;
  avgLoadTime?: number;
  successCount: number;
  failCount: number;
  lastVisited: number;
  notes?: string;
}

export function getSiteProfile(domain: string): SiteProfile | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM site_profiles WHERE domain = ?').get(domain) as any;
  if (!row) return null;

  return {
    domain: row.domain,
    bestReadMethod: row.best_read_method,
    contentSelector: row.content_selector,
    loginRequired: !!row.login_required,
    challengeType: row.challenge_type,
    avgLoadTime: row.avg_load_time,
    successCount: row.success_count,
    failCount: row.fail_count,
    lastVisited: row.last_visited,
    notes: row.notes,
  };
}

export function updateSiteProfile(domain: string, update: Partial<SiteProfile>): void {
  const db = getDb();
  const existing = getSiteProfile(domain);

  if (existing) {
    const fields: string[] = [];
    const values: any[] = [];

    if (update.bestReadMethod !== undefined) { fields.push('best_read_method = ?'); values.push(update.bestReadMethod); }
    if (update.contentSelector !== undefined) { fields.push('content_selector = ?'); values.push(update.contentSelector); }
    if (update.loginRequired !== undefined) { fields.push('login_required = ?'); values.push(update.loginRequired ? 1 : 0); }
    if (update.challengeType !== undefined) { fields.push('challenge_type = ?'); values.push(update.challengeType); }
    if (update.avgLoadTime !== undefined) { fields.push('avg_load_time = ?'); values.push(update.avgLoadTime); }
    if (update.successCount !== undefined) { fields.push('success_count = ?'); values.push(update.successCount); }
    if (update.failCount !== undefined) { fields.push('fail_count = ?'); values.push(update.failCount); }

    fields.push('last_visited = ?');
    values.push(Date.now());
    values.push(domain);

    db.prepare(`UPDATE site_profiles SET ${fields.join(', ')} WHERE domain = ?`).run(...values);
  } else {
    db.prepare(`
      INSERT INTO site_profiles (domain, best_read_method, content_selector, login_required, challenge_type, success_count, fail_count, last_visited, notes)
      VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
    `).run(
      domain,
      update.bestReadMethod || null,
      update.contentSelector || null,
      update.loginRequired ? 1 : 0,
      update.challengeType || null,
      Date.now(),
      update.notes || null,
    );
  }
}

export function recordSiteSuccess(domain: string, loadTime: number, readMethod: string): void {
  const existing = getSiteProfile(domain);
  updateSiteProfile(domain, {
    bestReadMethod: readMethod,
    avgLoadTime: existing ? Math.round((existing.avgLoadTime || loadTime + loadTime) / 2) : loadTime,
    successCount: (existing?.successCount || 0) + 1,
  });
}

export function recordSiteFailure(domain: string): void {
  const existing = getSiteProfile(domain);
  updateSiteProfile(domain, {
    failCount: (existing?.failCount || 0) + 1,
  });
}

// Cleanup

export function cleanExpiredCache(): void {
  const db = getDb();
  db.prepare('DELETE FROM content_cache WHERE expires_at < ?').run(Date.now());
}

function hashUrl(url: string): string {
  // Simple hash for URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
