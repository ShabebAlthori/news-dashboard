import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

type DB = Database.Database;

const globalForDb = globalThis as unknown as { __newsDb?: DB };

const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    publisher TEXT NOT NULL,
    url TEXT NOT NULL,
    homepage TEXT NOT NULL,
    section TEXT NOT NULL,
    kind TEXT NOT NULL,
    credibility REAL NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    etag TEXT,
    last_modified TEXT,
    last_attempt_at INTEGER,
    last_success_at INTEGER,
    last_status TEXT,
    last_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    ai_allowed INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES sources(id),
    guid TEXT NOT NULL,
    url TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL DEFAULT '',
    content_text TEXT NOT NULL DEFAULT '',
    author TEXT,
    image_url TEXT,
    published_at INTEGER,
    fetched_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    feed_categories TEXT NOT NULL DEFAULT '[]',
    sections TEXT NOT NULL DEFAULT '[]',
    categories TEXT NOT NULL DEFAULT '[]',
    companies TEXT NOT NULL DEFAULT '[]',
    event_type TEXT NOT NULL DEFAULT 'general',
    significance REAL NOT NULL DEFAULT 0.4,
    rumor INTEGER NOT NULL DEFAULT 0,
    policy INTEGER NOT NULL DEFAULT 0,
    clickbait REAL NOT NULL DEFAULT 0,
    excluded INTEGER NOT NULL DEFAULT 0,
    exclude_reason TEXT,
    tokens TEXT NOT NULL DEFAULT '[]',
    cluster_id INTEGER,
    title_en TEXT,
    title_ar TEXT,
    summary_en TEXT,
    summary_ar TEXT,
    summary_origin TEXT NOT NULL DEFAULT 'feed',
    ai_status TEXT NOT NULL DEFAULT 'pending',
    ai_model TEXT,
    ai_attempts INTEGER NOT NULL DEFAULT 0,
    ai_significance INTEGER,
    ai_error TEXT,
    ai_at INTEGER,
    read_at INTEGER,
    UNIQUE(source_id, guid)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_canonical ON articles(canonical_url);
  CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id);
  CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
  CREATE INDEX IF NOT EXISTS idx_articles_fetched ON articles(fetched_at);

  CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_article_id INTEGER,
    first_published_at INTEGER,
    last_published_at INTEGER,
    sort_time INTEGER NOT NULL,
    first_seen_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    article_count INTEGER NOT NULL DEFAULT 1,
    source_count INTEGER NOT NULL DEFAULT 1,
    sections TEXT NOT NULL DEFAULT '[]',
    categories TEXT NOT NULL DEFAULT '[]',
    companies TEXT NOT NULL DEFAULT '[]',
    event_type TEXT NOT NULL DEFAULT 'general',
    significance REAL NOT NULL DEFAULT 0.4,
    credibility REAL NOT NULL DEFAULT 0.8,
    has_official INTEGER NOT NULL DEFAULT 0,
    rumor INTEGER NOT NULL DEFAULT 0,
    policy INTEGER NOT NULL DEFAULT 0,
    penalties REAL NOT NULL DEFAULT 0,
    base_score REAL NOT NULL DEFAULT 0,
    excluded INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_clusters_sort ON clusters(sort_time);

  CREATE TABLE IF NOT EXISTS saved (
    article_id INTEGER PRIMARY KEY REFERENCES articles(id),
    saved_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fetch_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL,
    trigger TEXT NOT NULL,
    sources_ok INTEGER NOT NULL DEFAULT 0,
    sources_failed INTEGER NOT NULL DEFAULT 0,
    sources_skipped INTEGER NOT NULL DEFAULT 0,
    new_articles INTEGER NOT NULL DEFAULT 0,
    summarized INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS robots_cache (
    origin TEXT PRIMARY KEY,
    status INTEGER NOT NULL,
    body TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locks (
    name TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
    title, excerpt, title_ar, summary_en, summary_ar,
    content='articles', content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
    INSERT INTO articles_fts(rowid, title, excerpt, title_ar, summary_en, summary_ar)
    VALUES (new.id, new.title, new.excerpt, new.title_ar, new.summary_en, new.summary_ar);
  END;
  CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, excerpt, title_ar, summary_en, summary_ar)
    VALUES ('delete', old.id, old.title, old.excerpt, old.title_ar, old.summary_en, old.summary_ar);
  END;
  CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE OF title, excerpt, title_ar, summary_en, summary_ar ON articles BEGIN
    INSERT INTO articles_fts(articles_fts, rowid, title, excerpt, title_ar, summary_en, summary_ar)
    VALUES ('delete', old.id, old.title, old.excerpt, old.title_ar, old.summary_en, old.summary_ar);
    INSERT INTO articles_fts(rowid, title, excerpt, title_ar, summary_en, summary_ar)
    VALUES (new.id, new.title, new.excerpt, new.title_ar, new.summary_en, new.summary_ar);
  END;
  `,
];

function migrate(db: DB) {
  const version = db.pragma("user_version", { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

export function getDb(): DB {
  if (globalForDb.__newsDb) return globalForDb.__newsDb;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  globalForDb.__newsDb = db;
  return db;
}

/** For tests: open an isolated database (e.g. ':memory:'). */
export function openDatabase(file: string): DB {
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
