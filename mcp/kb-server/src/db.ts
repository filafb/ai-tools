import Database from 'better-sqlite3';
import matter from 'gray-matter';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import type { PageFrontmatter, StalePageRecord } from './types.js';

function wikiRoot(): string {
  return process.env['WIKI_ROOT_OVERRIDE'] || join(homedir(), '.claude', 'wiki');
}

function dbPath(): string {
  return join(wikiRoot(), 'wiki.db');
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(wikiRoot(), { recursive: true });
  _db = new Database(dbPath());
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      path TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      category TEXT,
      source_type TEXT NOT NULL DEFAULT 'article',
      source_files TEXT,
      source_commit TEXT,
      repo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
      path UNINDEXED,
      title,
      summary,
      content,
      tokenize = 'porter ascii'
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return _db;
}

// Exported for tests only — closes connection and deletes the DB file so each test starts fresh.
export function resetDb(): void {
  if (_db) { _db.close(); _db = null; }
  if (process.env['WIKI_ROOT_OVERRIDE']) {
    const root = process.env['WIKI_ROOT_OVERRIDE']!;
    mkdirSync(root, { recursive: true });
    try { rmSync(join(root, 'wiki.db')); } catch { /* doesn't exist yet */ }
  }
}

// gray-matter (via js-yaml) may parse YYYY-MM-DD as a Date object — coerce to string
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().split('T')[0]!;
  return String(v ?? '');
}

export function upsertPage(path: string, fm: PageFrontmatter, body: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO pages
      (path, title, summary, category, source_type, source_files, source_commit, repo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    path, fm.title, fm.summary ?? null, fm.category, fm.source_type,
    fm.source_files ? JSON.stringify(fm.source_files) : null,
    fm.source_commit ?? null, fm.repo ?? null,
    toDateStr(fm.created_at), toDateStr(fm.updated_at),
  );

  db.prepare('DELETE FROM fts WHERE path = ?').run(path);
  db.prepare('INSERT INTO fts (path, title, summary, content) VALUES (?, ?, ?, ?)').run(
    path, fm.title, fm.summary ?? '', body,
  );
}

export function deletePage(path: string): void {
  const db = getDb();
  db.prepare('DELETE FROM pages WHERE path = ?').run(path);
  db.prepare('DELETE FROM fts WHERE path = ?').run(path);
}

export function getPage(path: string): { frontmatter: PageFrontmatter } | undefined {
  const row = getDb().prepare('SELECT * FROM pages WHERE path = ?').get(path) as
    Record<string, unknown> | undefined;
  if (!row) return undefined;
  return {
    frontmatter: {
      title: row['title'] as string,
      summary: row['summary'] as string | undefined,
      category: row['category'] as string,
      source_type: row['source_type'] as PageFrontmatter['source_type'],
      source_files: row['source_files'] ? JSON.parse(row['source_files'] as string) as string[] : undefined,
      source_commit: row['source_commit'] as string | undefined,
      repo: row['repo'] as string | undefined,
      created_at: row['created_at'] as string,
      updated_at: row['updated_at'] as string,
    },
  };
}

export function searchFts(query: string, limit: number): Array<{ path: string; title: string; summary: string; snippet: string }> {
  const db = getDb();
  return db.prepare(`
    SELECT path, title, summary,
           snippet(fts, 3, '[', ']', '...', 24) AS snippet
    FROM fts
    WHERE fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Array<{ path: string; title: string; summary: string; snippet: string }>;
}

export function listPages(category?: string): Array<{ path: string; title: string; summary: string; category: string }> {
  const db = getDb();
  if (category) {
    return db.prepare(
      'SELECT path, title, summary, category FROM pages WHERE category = ? ORDER BY path'
    ).all(category) as Array<{ path: string; title: string; summary: string; category: string }>;
  }
  return db.prepare(
    'SELECT path, title, summary, category FROM pages ORDER BY category, path'
  ).all() as Array<{ path: string; title: string; summary: string; category: string }>;
}

export function getCodeDerivedPages(): StalePageRecord[] {
  const rows = getDb().prepare(`
    SELECT path, title, repo, source_files, source_commit
    FROM pages
    WHERE source_type = 'code' AND source_commit IS NOT NULL AND repo IS NOT NULL
  `).all() as Array<{ path: string; title: string; repo: string; source_files: string; source_commit: string }>;

  return rows.map(r => ({
    path: r.path,
    title: r.title,
    repo: r.repo,
    source_files: JSON.parse(r.source_files) as string[],
    source_commit: r.source_commit,
  }));
}

export function getMetaValue(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMetaValue(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value);
}

export function rebuildFromDisk(pagesDir: string): void {
  const db = getDb();
  db.exec('DELETE FROM pages; DELETE FROM fts;');

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.md')) {
        const raw = readFileSync(full, 'utf8');
        const { data: fm, content: body } = matter(raw);
        const relPath = full.slice(pagesDir.length + 1).replace(/\\/g, '/');
        if (fm['title'] && fm['source_type'] && fm['category'] && fm['created_at'] && fm['updated_at']) {
          upsertPage(relPath, fm as PageFrontmatter, body);
        }
      }
    }
  }
  walk(pagesDir);
}

export { getDb };
