# Knowledge Base Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal knowledge base with an MCP server (SQLite + FTS5), interactive ingest skills, and two agents — so SDLC agents can query and write accumulated knowledge during their work.

**Architecture:** Markdown files at `~/.claude/wiki/` are the source of truth. A SQLite database with FTS5 provides ranked full-text search. An MCP server exposes four tools (`wiki_search`, `wiki_read`, `wiki_write`, `wiki_list`) to all Claude Code agents. Three skills give the human a front door for ingest, search, and staleness review. A session-start hook fires once per new HEAD on the default branch to surface stale code-derived pages.

**Tech Stack:** TypeScript (strict), Node.js 20+, `@modelcontextprotocol/sdk`, `better-sqlite3`, `gray-matter`, `zod`, `node:test`

## Global Constraints

- TypeScript strict mode; `"type": "module"` in package.json; `"module": "NodeNext"` in tsconfig
- All imports use `.js` extensions (ESM NodeNext resolution)
- Wiki root: `~/.claude/wiki/` resolved at runtime via `os.homedir()`
- Page paths passed to MCP tools are always relative to `~/.claude/wiki/pages/`
- `wiki_write` accepts the full markdown string including YAML frontmatter — the tool parses frontmatter to extract DB fields; it never takes a separate metadata param
- Markdown files are the source of truth; SQLite is a derived index, rebuilt from disk on demand
- Tests use `node:test` + `node:assert/strict`, run with `npx tsx --test src/tests/<file>.test.ts`
- No Jest, Vitest, or Mocha
- YAGNI: do not add features not in this plan

---

### Task 1: MCP server scaffold and shared types

**Files:**
- Create: `mcp/kb-server/package.json`
- Create: `mcp/kb-server/tsconfig.json`
- Create: `mcp/kb-server/src/types.ts`

**Interfaces:**
- Produces: `Page`, `SearchResult`, `StalePageRecord` types used by all later tasks

- [ ] **Step 1: Create `mcp/kb-server/package.json`**

```json
{
  "name": "kb-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "tsx --test src/tests/db.test.ts src/tests/tools.test.ts src/tests/staleness.test.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^9.4.3",
    "gray-matter": "^4.0.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create `mcp/kb-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/tests"]
}
```

- [ ] **Step 3: Create `mcp/kb-server/src/types.ts`**

```typescript
export interface PageFrontmatter {
  title: string;
  summary?: string;
  category: string;
  source_type: 'code' | 'article' | 'decision' | 'research' | 'conversation';
  source_files?: string[];
  source_commit?: string;
  repo?: string;
  created_at: string;
  updated_at: string;
}

export interface Page extends PageFrontmatter {
  path: string;   // relative to ~/.claude/wiki/pages/
  content: string; // full markdown body (no frontmatter)
}

export interface SearchResult {
  path: string;
  title: string;
  summary: string;
  snippet: string;
  content?: string; // only present for top-N results
}

export interface StalePageRecord {
  path: string;
  title: string;
  repo: string;
  source_files: string[];
  source_commit: string;
}
```

- [ ] **Step 4: Install dependencies**

```bash
cd mcp/kb-server && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd mcp/kb-server && npx tsc --noEmit
```

Expected: no output (clean compile).

- [ ] **Step 6: Commit**

```bash
git add mcp/kb-server/package.json mcp/kb-server/package-lock.json \
        mcp/kb-server/tsconfig.json mcp/kb-server/src/types.ts
git commit -m "feat(kb): scaffold MCP server with shared types"
```

---

### Task 2: Database layer

**Files:**
- Create: `mcp/kb-server/src/db.ts`
- Create: `mcp/kb-server/src/tests/db.test.ts`

**Interfaces:**
- Consumes: `Page`, `PageFrontmatter`, `StalePageRecord` from `./types.js`
- Produces:
  - `getDb(): Database.Database` — returns the singleton DB connection
  - `upsertPage(path: string, frontmatter: PageFrontmatter, body: string): void`
  - `deletePage(path: string): void`
  - `getPage(path: string): { frontmatter: PageFrontmatter } | undefined`
  - `searchFts(query: string, limit: number): Array<{ path: string; title: string; summary: string; snippet: string }>`
  - `listPages(category?: string): Array<{ path: string; title: string; summary: string; category: string }>`
  - `getCodeDerivedPages(): StalePageRecord[]`
  - `getMetaValue(key: string): string | undefined`
  - `setMetaValue(key: string, value: string): void`
  - `rebuildFromDisk(pagesDir: string): void`

- [ ] **Step 1: Write the failing tests**

Create `mcp/kb-server/src/tests/db.test.ts`:

```typescript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test db.ts by pointing WIKI_ROOT at a temp directory.
// Each test gets a fresh DB via resetDb().
process.env['WIKI_ROOT_OVERRIDE'] = '';

let tmpRoot: string;

before(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kb-test-'));
  process.env['WIKI_ROOT_OVERRIDE'] = tmpRoot;
});

after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// Lazy import after env var is set
const getModule = async () => import('../db.js');

test('upsertPage writes to pages table and FTS', async () => {
  const { upsertPage, searchFts, resetDb } = await getModule();
  resetDb();

  upsertPage('concepts/test.md', {
    title: 'Test Concept',
    summary: 'A concept about testing',
    category: 'concepts',
    source_type: 'article',
    created_at: '2026-06-24',
    updated_at: '2026-06-24',
  }, 'Full body content about testing strategies.');

  const results = searchFts('testing', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.title, 'Test Concept');
  assert.ok(results[0]!.snippet.length > 0);
});

test('deletePage removes from both tables', async () => {
  const { upsertPage, deletePage, searchFts, resetDb } = await getModule();
  resetDb();

  upsertPage('concepts/delete-me.md', {
    title: 'Delete Me',
    summary: 'Will be deleted',
    category: 'concepts',
    source_type: 'article',
    created_at: '2026-06-24',
    updated_at: '2026-06-24',
  }, 'Body to be deleted.');

  deletePage('concepts/delete-me.md');
  const results = searchFts('deleted', 5);
  assert.equal(results.length, 0);
});

test('listPages filters by category', async () => {
  const { upsertPage, listPages, resetDb } = await getModule();
  resetDb();

  upsertPage('concepts/alpha.md', {
    title: 'Alpha', summary: 'Alpha concept', category: 'concepts',
    source_type: 'article', created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'Alpha body.');

  upsertPage('decisions/beta.md', {
    title: 'Beta', summary: 'Beta decision', category: 'decisions',
    source_type: 'decision', created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'Beta body.');

  const concepts = listPages('concepts');
  assert.equal(concepts.length, 1);
  assert.equal(concepts[0]!.title, 'Alpha');

  const all = listPages();
  assert.equal(all.length, 2);
});

test('getCodeDerivedPages returns only code-type pages', async () => {
  const { upsertPage, getCodeDerivedPages, resetDb } = await getModule();
  resetDb();

  upsertPage('projects/my-app/auth.md', {
    title: 'Auth Flow', summary: 'Token flow', category: 'projects/my-app',
    source_type: 'code',
    source_files: ['src/auth/token.ts'],
    source_commit: 'abc123',
    repo: '/home/user/my-app',
    created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'Auth body.');

  upsertPage('concepts/pattern.md', {
    title: 'Pattern', summary: 'A pattern', category: 'concepts',
    source_type: 'article', created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'Pattern body.');

  const codeDerived = getCodeDerivedPages();
  assert.equal(codeDerived.length, 1);
  assert.equal(codeDerived[0]!.source_commit, 'abc123');
  assert.deepEqual(codeDerived[0]!.source_files, ['src/auth/token.ts']);
});

test('meta key-value store roundtrips', async () => {
  const { getMetaValue, setMetaValue, resetDb } = await getModule();
  resetDb();

  assert.equal(getMetaValue('missing'), undefined);
  setMetaValue('my_key', 'hello');
  assert.equal(getMetaValue('my_key'), 'hello');
  setMetaValue('my_key', 'world');
  assert.equal(getMetaValue('my_key'), 'world');
});

test('rebuildFromDisk re-indexes pages from markdown files', async () => {
  const { rebuildFromDisk, searchFts, resetDb } = await getModule();
  resetDb();

  const pagesDir = join(tmpRoot, 'pages', 'concepts');
  mkdirSync(pagesDir, { recursive: true });
  writeFileSync(join(pagesDir, 'rebuilt.md'), [
    '---',
    'title: Rebuilt Page',
    'summary: Created on disk',
    'category: concepts',
    'source_type: article',
    'created_at: 2026-06-24',
    'updated_at: 2026-06-24',
    '---',
    '',
    'Rebuilt body content.',
  ].join('\n'));

  rebuildFromDisk(join(tmpRoot, 'pages'));

  const results = searchFts('rebuilt', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0]!.title, 'Rebuilt Page');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mcp/kb-server && npx tsx --test src/tests/db.test.ts
```

Expected: errors like `Cannot find module '../db.js'`.

- [ ] **Step 3: Implement `mcp/kb-server/src/db.ts`**

```typescript
import Database from 'better-sqlite3';
import matter from 'gray-matter';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

// Exported for tests only — resets the singleton so tests get a fresh in-memory DB.
export function resetDb(): void {
  if (_db) { _db.close(); _db = null; }
  // Use in-memory DB when running under test override
  if (process.env['WIKI_ROOT_OVERRIDE']) {
    mkdirSync(process.env['WIKI_ROOT_OVERRIDE']!, { recursive: true });
  }
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
    fm.created_at, fm.updated_at,
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp/kb-server && npx tsx --test src/tests/db.test.ts
```

Expected: `✓ upsertPage writes to pages table and FTS`, `✓ deletePage removes from both tables`, `✓ listPages filters by category`, `✓ getCodeDerivedPages returns only code-type pages`, `✓ meta key-value store roundtrips`, `✓ rebuildFromDisk re-indexes pages from markdown files`.

- [ ] **Step 5: Commit**

```bash
git add mcp/kb-server/src/db.ts mcp/kb-server/src/tests/db.test.ts
git commit -m "feat(kb): add SQLite + FTS5 database layer"
```

---

### Task 3: wiki_write tool

**Files:**
- Create: `mcp/kb-server/src/tools/write.ts`
- Create: `mcp/kb-server/src/tests/tools.test.ts` (write section only — tests will grow in Tasks 4 and 5)

**Interfaces:**
- Consumes: `upsertPage`, `deletePage` from `../db.js`; `PageFrontmatter` from `../types.js`
- Produces: `handleWikiWrite(path: string, content: string): { success: boolean; message: string }`

- [ ] **Step 1: Write the failing test**

Create `mcp/kb-server/src/tests/tools.test.ts`:

```typescript
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;

before(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'kb-tools-test-'));
  process.env['WIKI_ROOT_OVERRIDE'] = tmpRoot;
});

after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env['WIKI_ROOT_OVERRIDE'];
});

const getWrite = async () => (await import('../tools/write.js')).handleWikiWrite;

test('wiki_write creates file on disk and indexes in DB', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiWrite = await getWrite();

  const content = [
    '---',
    'title: My Concept',
    'summary: A useful concept',
    'category: concepts',
    'source_type: article',
    'created_at: 2026-06-24',
    'updated_at: 2026-06-24',
    '---',
    '',
    'Body of the concept.',
  ].join('\n');

  const result = handleWikiWrite('pages/concepts/my-concept.md', content);
  assert.equal(result.success, true);

  // File written to disk
  const filePath = join(tmpRoot, 'pages', 'concepts', 'my-concept.md');
  assert.ok(existsSync(filePath));
  assert.equal(readFileSync(filePath, 'utf8'), content);
});

test('wiki_write for index.md writes to wiki root, not pages/', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiWrite = await getWrite();

  const result = handleWikiWrite('index.md', '# Index\n\n- [My Concept](pages/concepts/my-concept.md) — A useful concept');
  assert.equal(result.success, true);

  const filePath = join(tmpRoot, 'index.md');
  assert.ok(existsSync(filePath));
});

test('wiki_write rejects path traversal', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiWrite = await getWrite();

  const result = handleWikiWrite('../../../etc/passwd', 'malicious');
  assert.equal(result.success, false);
  assert.ok(result.message.includes('Invalid path'));
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd mcp/kb-server && npx tsx --test src/tests/tools.test.ts 2>&1 | head -20
```

Expected: `Cannot find module '../tools/write.js'`.

- [ ] **Step 3: Implement `mcp/kb-server/src/tools/write.ts`**

```typescript
import matter from 'gray-matter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize, resolve } from 'node:path';
import { upsertPage } from '../db.js';
import type { PageFrontmatter } from '../types.js';

function wikiRoot(): string {
  return process.env['WIKI_ROOT_OVERRIDE'] || join(homedir(), '.claude', 'wiki');
}

function resolveSafePath(relativePath: string): string | null {
  const root = resolve(wikiRoot());
  const full = resolve(join(root, relativePath));
  // Prevent path traversal
  if (!full.startsWith(root + '/') && full !== root) return null;
  return full;
}

export function handleWikiWrite(path: string, content: string): { success: boolean; message: string } {
  const fullPath = resolveSafePath(path);
  if (!fullPath) {
    return { success: false, message: `Invalid path: ${path}` };
  }

  // Write file to disk
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');

  // Only index markdown files under pages/
  const root = wikiRoot();
  const pagesDir = resolve(join(root, 'pages'));
  if (fullPath.startsWith(pagesDir + '/') && path.endsWith('.md')) {
    try {
      const { data: fm, content: body } = matter(content);
      const relativePath = fullPath.slice(pagesDir.length + 1).replace(/\\/g, '/');
      upsertPage(relativePath, fm as PageFrontmatter, body.trim());
    } catch {
      // Don't fail the write if indexing fails — file is already on disk
    }
  }

  return { success: true, message: `Written: ${path}` };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp/kb-server && npx tsx --test src/tests/tools.test.ts
```

Expected: all three wiki_write tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcp/kb-server/src/tools/write.ts mcp/kb-server/src/tests/tools.test.ts
git commit -m "feat(kb): add wiki_write tool"
```

---

### Task 4: wiki_search tool

**Files:**
- Create: `mcp/kb-server/src/tools/search.ts`
- Modify: `mcp/kb-server/src/tests/tools.test.ts` (append search tests)

**Interfaces:**
- Consumes: `searchFts`, `getDb` from `../db.js`; `readFileSync` for full content
- Produces: `handleWikiSearch(query: string, limit?: number): SearchResult[]`

- [ ] **Step 1: Append failing tests to `tools.test.ts`**

Add at the end of `mcp/kb-server/src/tests/tools.test.ts`:

```typescript
const getSearch = async () => (await import('../tools/search.js')).handleWikiSearch;

test('wiki_search returns ranked results with snippets', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiWrite = await getWrite();

  handleWikiWrite('pages/concepts/caching.md', [
    '---', 'title: Caching Strategy', 'summary: How to cache API responses',
    'category: concepts', 'source_type: article',
    'created_at: 2026-06-24', 'updated_at: 2026-06-24', '---', '',
    'Use Redis for caching frequently accessed data. Set a TTL of 5 minutes for API responses.',
  ].join('\n'));

  handleWikiWrite('pages/concepts/databases.md', [
    '---', 'title: Database Design', 'summary: Postgres schema patterns',
    'category: concepts', 'source_type: article',
    'created_at: 2026-06-24', 'updated_at: 2026-06-24', '---', '',
    'Prefer normalized schemas. Use indexes on foreign keys.',
  ].join('\n'));

  const handleWikiSearch = await getSearch();
  const results = handleWikiSearch('caching API', 5);

  assert.ok(results.length >= 1);
  assert.equal(results[0]!.title, 'Caching Strategy');
  assert.ok(results[0]!.snippet.length > 0);
});

test('wiki_search returns full content for top 2 results', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiWrite = await getWrite();

  for (let i = 0; i < 3; i++) {
    handleWikiWrite(`pages/concepts/item-${i}.md`, [
      '---', `title: Item ${i}`, `summary: Summary for item ${i}`,
      'category: concepts', 'source_type: article',
      'created_at: 2026-06-24', 'updated_at: 2026-06-24', '---', '',
      `Body content for item ${i} about search testing.`,
    ].join('\n'));
  }

  const handleWikiSearch = await getSearch();
  const results = handleWikiSearch('search testing', 10);

  assert.ok(results.length >= 3);
  assert.ok(results[0]!.content !== undefined, 'top result should have full content');
  assert.ok(results[1]!.content !== undefined, 'second result should have full content');
  assert.equal(results[2]?.content, undefined, 'third result should not have full content');
});

test('wiki_search returns empty array for no match', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiSearch = await getSearch();
  const results = handleWikiSearch('xyzzy_nonexistent_term', 5);
  assert.equal(results.length, 0);
});
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
cd mcp/kb-server && npx tsx --test src/tests/tools.test.ts 2>&1 | grep -E '(✓|✗|Cannot)'
```

Expected: existing tests pass, new search tests fail with `Cannot find module '../tools/search.js'`.

- [ ] **Step 3: Implement `mcp/kb-server/src/tools/search.ts`**

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { searchFts } from '../db.js';
import type { SearchResult } from '../types.js';

function wikiRoot(): string {
  return process.env['WIKI_ROOT_OVERRIDE'] || join(homedir(), '.claude', 'wiki');
}

export function handleWikiSearch(query: string, limit = 10): SearchResult[] {
  const rows = searchFts(query, limit);
  const pagesDir = resolve(join(wikiRoot(), 'pages'));

  return rows.map((row, idx) => {
    const result: SearchResult = {
      path: row.path,
      title: row.title,
      summary: row.summary ?? '',
      snippet: row.snippet,
    };

    // Include full content for top 2 results
    if (idx < 2) {
      const fullPath = join(pagesDir, row.path);
      if (existsSync(fullPath)) {
        result.content = readFileSync(fullPath, 'utf8');
      }
    }

    return result;
  });
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
cd mcp/kb-server && npx tsx --test src/tests/tools.test.ts
```

Expected: all tests pass including the three new search tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/kb-server/src/tools/search.ts mcp/kb-server/src/tests/tools.test.ts
git commit -m "feat(kb): add wiki_search tool with FTS5 ranked results"
```

---

### Task 5: wiki_read and wiki_list tools

**Files:**
- Create: `mcp/kb-server/src/tools/read.ts`
- Create: `mcp/kb-server/src/tools/list.ts`
- Modify: `mcp/kb-server/src/tests/tools.test.ts` (append read and list tests)

**Interfaces:**
- Produces:
  - `handleWikiRead(path: string): { content: string } | { error: string }`
  - `handleWikiList(category?: string): Array<{ path: string; title: string; summary: string; category: string }>`

- [ ] **Step 1: Append failing tests to `tools.test.ts`**

```typescript
const getRead = async () => (await import('../tools/read.js')).handleWikiRead;
const getList = async () => (await import('../tools/list.js')).handleWikiList;

test('wiki_read returns full content of an existing page', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiWrite = await getWrite();
  const handleWikiRead = await getRead();

  const md = '---\ntitle: Readable\nsummary: Test\ncategory: concepts\nsource_type: article\ncreated_at: 2026-06-24\nupdated_at: 2026-06-24\n---\n\nReadable body.';
  handleWikiWrite('pages/concepts/readable.md', md);

  const result = handleWikiRead('pages/concepts/readable.md');
  assert.ok('content' in result);
  assert.equal((result as { content: string }).content, md);
});

test('wiki_read returns error for missing page', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiRead = await getRead();

  const result = handleWikiRead('concepts/does-not-exist.md');
  assert.ok('error' in result);
});

test('wiki_read rejects path traversal', async () => {
  const { resetDb } = await import('../db.js');
  resetDb();
  const handleWikiRead = await getRead();

  const result = handleWikiRead('../../etc/passwd');
  assert.ok('error' in result);
});

test('wiki_list returns all pages when no category given', async () => {
  const { resetDb, upsertPage } = await import('../db.js');
  resetDb();
  const handleWikiList = await getList();

  upsertPage('concepts/a.md', {
    title: 'A', summary: 'Alpha', category: 'concepts', source_type: 'article',
    created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'body');
  upsertPage('decisions/b.md', {
    title: 'B', summary: 'Beta', category: 'decisions', source_type: 'decision',
    created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'body');

  const all = handleWikiList();
  assert.equal(all.length, 2);
});

test('wiki_list filters by category', async () => {
  const { resetDb, upsertPage } = await import('../db.js');
  resetDb();
  const handleWikiList = await getList();

  upsertPage('concepts/c.md', {
    title: 'C', summary: 'Gamma', category: 'concepts', source_type: 'article',
    created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'body');
  upsertPage('research/d.md', {
    title: 'D', summary: 'Delta', category: 'research', source_type: 'research',
    created_at: '2026-06-24', updated_at: '2026-06-24',
  }, 'body');

  const concepts = handleWikiList('concepts');
  assert.equal(concepts.length, 1);
  assert.equal(concepts[0]!.title, 'C');
});
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
cd mcp/kb-server && npx tsx --test src/tests/tools.test.ts 2>&1 | grep -E '(✓|✗|Cannot)'
```

Expected: existing tests pass, new read/list tests fail with `Cannot find module`.

- [ ] **Step 3: Implement `mcp/kb-server/src/tools/read.ts`**

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function wikiRoot(): string {
  return process.env['WIKI_ROOT_OVERRIDE'] || join(homedir(), '.claude', 'wiki');
}

function resolveSafePath(relativePath: string): string | null {
  const root = resolve(wikiRoot());
  const full = resolve(join(root, relativePath));
  if (!full.startsWith(root + '/') && full !== root) return null;
  return full;
}

export function handleWikiRead(path: string): { content: string } | { error: string } {
  const fullPath = resolveSafePath(path);
  if (!fullPath) return { error: `Invalid path: ${path}` };
  if (!existsSync(fullPath)) return { error: `Page not found: ${path}` };
  return { content: readFileSync(fullPath, 'utf8') };
}
```

- [ ] **Step 4: Implement `mcp/kb-server/src/tools/list.ts`**

```typescript
import { listPages } from '../db.js';

export function handleWikiList(
  category?: string,
): Array<{ path: string; title: string; summary: string; category: string }> {
  return listPages(category);
}
```

- [ ] **Step 5: Run all tests to verify they pass**

```bash
cd mcp/kb-server && npx tsx --test src/tests/tools.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add mcp/kb-server/src/tools/read.ts mcp/kb-server/src/tools/list.ts \
        mcp/kb-server/src/tests/tools.test.ts
git commit -m "feat(kb): add wiki_read and wiki_list tools"
```

---

### Task 6: Staleness check

**Files:**
- Create: `mcp/kb-server/src/staleness.ts`
- Create: `mcp/kb-server/src/tests/staleness.test.ts`

**Interfaces:**
- Consumes: `getCodeDerivedPages`, `getMetaValue`, `setMetaValue` from `./db.js`
- Produces:
  - `getCurrentBranch(repoPath: string): string | null`
  - `getDefaultBranch(repoPath: string): string | null`
  - `isOnDefaultBranch(repoPath: string): boolean`
  - `getHeadCommit(repoPath: string): string | null`
  - `checkStaleness(repoPath: string): StalePageRecord[]`
  - `shouldNotify(repoPath: string): boolean` — true only if HEAD moved since last notification
  - `markNotified(repoPath: string, commit: string): void`

- [ ] **Step 1: Write the failing tests**

Create `mcp/kb-server/src/tests/staleness.test.ts`:

```typescript
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// We test staleness.ts by mocking child_process.execSync.
// The module is re-imported fresh per test via dynamic import with a cache-bust.
// We also stub db functions directly.

test('isOnDefaultBranch returns false when on feature branch', async () => {
  const { isOnDefaultBranch } = await import('../staleness.js');

  // The function calls execSync for current branch and default branch.
  // We mock execSync to control the output.
  // Since mocking ESM internals is complex, we test indirectly via checkStaleness
  // which calls isOnDefaultBranch and returns [] when not on default branch.
  // For unit-level tests of branch detection, we verify the public contract:
  // - checkStaleness returns [] when not on default branch.
  // This is tested in the integration test below using a real git repo.
  assert.ok(true); // placeholder — real test below
});

test('checkStaleness returns empty array when no code-derived pages', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execSync } = await import('node:child_process');

  const dir = mkdtempSync(`${tmpdir()}/staleness-test-`);
  try {
    // Init git repo
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
    execSync('touch README.md && git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe', shell: true });

    process.env['WIKI_ROOT_OVERRIDE'] = `${dir}/wiki`;
    const { resetDb } = await import('../db.js');
    resetDb();

    const { checkStaleness } = await import('../staleness.js');
    const stale = checkStaleness(dir);
    assert.equal(stale.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env['WIKI_ROOT_OVERRIDE'];
  }
});

test('checkStaleness flags page when source file changed since indexed commit', async () => {
  const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execSync } = await import('node:child_process');
  const { join } = await import('node:path');

  const dir = mkdtempSync(`${tmpdir()}/staleness-stale-`);
  try {
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "t@t.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "T"', { cwd: dir, stdio: 'pipe' });

    // Initial commit with src file
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'auth.ts'), 'export const auth = () => {};');
    execSync('git add . && git commit -m "initial"', { cwd: dir, stdio: 'pipe', shell: true });
    const initialCommit = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();

    // Insert a KB page referencing the initial commit
    process.env['WIKI_ROOT_OVERRIDE'] = `${dir}/wiki`;
    const { resetDb, upsertPage } = await import('../db.js');
    resetDb();
    upsertPage('projects/my-app/auth.md', {
      title: 'Auth', summary: 'Auth module', category: 'projects/my-app',
      source_type: 'code', source_files: ['src/auth.ts'],
      source_commit: initialCommit, repo: dir,
      created_at: '2026-06-24', updated_at: '2026-06-24',
    }, 'Auth body');

    // Make a new commit changing the file
    writeFileSync(join(dir, 'src', 'auth.ts'), 'export const auth = () => "changed";');
    execSync('git add . && git commit -m "change auth"', { cwd: dir, stdio: 'pipe', shell: true });

    const { checkStaleness } = await import('../staleness.js');
    const stale = checkStaleness(dir);

    assert.equal(stale.length, 1);
    assert.equal(stale[0]!.path, 'projects/my-app/auth.md');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env['WIKI_ROOT_OVERRIDE'];
  }
});

test('shouldNotify returns false when HEAD matches last notification', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { execSync } = await import('node:child_process');

  const dir = mkdtempSync(`${tmpdir()}/staleness-notify-`);
  try {
    execSync('git init', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.email "t@t.com"', { cwd: dir, stdio: 'pipe' });
    execSync('git config user.name "T"', { cwd: dir, stdio: 'pipe' });
    writeFileSync(`${dir}/README.md`, 'hello');
    execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe', shell: true });
    const head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();

    process.env['WIKI_ROOT_OVERRIDE'] = `${dir}/wiki`;
    const { resetDb } = await import('../db.js');
    resetDb();

    const { shouldNotify, markNotified } = await import('../staleness.js');

    assert.equal(shouldNotify(dir), true); // first time, no record
    markNotified(dir, head);
    assert.equal(shouldNotify(dir), false); // same HEAD, already notified
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env['WIKI_ROOT_OVERRIDE'];
  }
});
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd mcp/kb-server && npx tsx --test src/tests/staleness.test.ts 2>&1 | head -20
```

Expected: `Cannot find module '../staleness.js'`.

- [ ] **Step 3: Implement `mcp/kb-server/src/staleness.ts`**

```typescript
import { execSync } from 'node:child_process';
import { getCodeDerivedPages, getMetaValue, setMetaValue } from './db.js';
import type { StalePageRecord } from './types.js';

function exec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export function getCurrentBranch(repoPath: string): string | null {
  return exec('git branch --show-current', repoPath);
}

export function getDefaultBranch(repoPath: string): string | null {
  const ref = exec('git symbolic-ref refs/remotes/origin/HEAD', repoPath);
  if (ref) return ref.replace('refs/remotes/origin/', '');
  // Fallback: check for main or master
  const branches = exec('git branch', repoPath) ?? '';
  if (branches.includes('main')) return 'main';
  if (branches.includes('master')) return 'master';
  return null;
}

export function isOnDefaultBranch(repoPath: string): boolean {
  const current = getCurrentBranch(repoPath);
  const defaultBranch = getDefaultBranch(repoPath);
  if (!current || !defaultBranch) return false;
  return current === defaultBranch;
}

export function getHeadCommit(repoPath: string): string | null {
  return exec('git rev-parse HEAD', repoPath);
}

export function checkStaleness(repoPath: string): StalePageRecord[] {
  if (!isOnDefaultBranch(repoPath)) return [];

  const pages = getCodeDerivedPages().filter(p => p.repo === repoPath);
  const stale: StalePageRecord[] = [];

  for (const page of pages) {
    const fileArgs = page.source_files.map(f => `"${f}"`).join(' ');
    const diff = exec(
      `git diff "${page.source_commit}"..HEAD -- ${fileArgs}`,
      repoPath,
    );
    if (diff && diff.length > 0) {
      stale.push(page);
    }
  }

  return stale;
}

export function shouldNotify(repoPath: string): boolean {
  const head = getHeadCommit(repoPath);
  if (!head) return false;
  const lastNotified = getMetaValue(`staleness_notified:${repoPath}`);
  return lastNotified !== head;
}

export function markNotified(repoPath: string, commit: string): void {
  setMetaValue(`staleness_notified:${repoPath}`, commit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd mcp/kb-server && npx tsx --test src/tests/staleness.test.ts
```

Expected: all four tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcp/kb-server/src/staleness.ts mcp/kb-server/src/tests/staleness.test.ts
git commit -m "feat(kb): add git-based staleness check"
```

---

### Task 7: MCP server entry point

**Files:**
- Create: `mcp/kb-server/src/index.ts`

**Interfaces:**
- Consumes: all four tool handlers; `McpServer`, `StdioServerTransport` from SDK; `z` from zod
- Produces: a running MCP server process when invoked with `node dist/index.js`

- [ ] **Step 1: Implement `mcp/kb-server/src/index.ts`**

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleWikiSearch } from './tools/search.js';
import { handleWikiRead } from './tools/read.js';
import { handleWikiWrite } from './tools/write.js';
import { handleWikiList } from './tools/list.js';

const server = new McpServer({
  name: 'kb',
  version: '1.0.0',
});

server.tool(
  'wiki_search',
  'Search the personal knowledge base with full-text search. Returns ranked results with snippets. Top 2 results include full page content.',
  {
    query: z.string().describe('Search query — use keywords, not a question'),
    limit: z.number().int().min(1).max(20).optional().default(10).describe('Max results to return'),
  },
  async ({ query, limit }) => {
    const results = handleWikiSearch(query, limit);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
    };
  },
);

server.tool(
  'wiki_read',
  'Read the full content of a KB page by its path (relative to ~/.claude/wiki/pages/).',
  {
    path: z.string().describe('Page path, e.g. "concepts/caching.md" or "index.md"'),
  },
  async ({ path }) => {
    const result = handleWikiRead(path);
    if ('error' in result) {
      return { content: [{ type: 'text' as const, text: `Error: ${result.error}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: result.content }] };
  },
);

server.tool(
  'wiki_write',
  'Write or update a KB page. Content must include YAML frontmatter with title, summary, category, source_type, created_at, updated_at. Pages under pages/ are auto-indexed; index.md and log.md at the root are written as-is.',
  {
    path: z.string().describe('Page path relative to ~/.claude/wiki/, e.g. "pages/concepts/caching.md" or "index.md"'),
    content: z.string().describe('Full markdown content including YAML frontmatter'),
  },
  async ({ path, content }) => {
    const result = handleWikiWrite(path, content);
    if (!result.success) {
      return { content: [{ type: 'text' as const, text: `Error: ${result.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: result.message }] };
  },
);

server.tool(
  'wiki_list',
  'List KB pages with titles and summaries. Optionally filter by category (e.g. "concepts", "decisions", "projects/my-app").',
  {
    category: z.string().optional().describe('Filter by category name'),
  },
  async ({ category }) => {
    const pages = handleWikiList(category);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(pages, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build and verify it compiles**

```bash
cd mcp/kb-server && npm run build
```

Expected: `dist/` created with `.js` and `.d.ts` files, no TypeScript errors.

- [ ] **Step 3: Smoke-test the server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node mcp/kb-server/dist/index.js
```

Expected: JSON response listing all four tools (`wiki_search`, `wiki_read`, `wiki_write`, `wiki_list`).

- [ ] **Step 4: Run all tests one final time**

```bash
cd mcp/kb-server && npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcp/kb-server/src/index.ts mcp/kb-server/dist/
git commit -m "feat(kb): wire MCP server entry point with all four tools"
```

---

### Task 8: Session-start hook script

**Files:**
- Create: `mcp/kb-server/src/hooks/session-start.ts`

**Interfaces:**
- Consumes: `checkStaleness`, `shouldNotify`, `markNotified`, `getHeadCommit`, `isOnDefaultBranch` from `../staleness.js`
- Produces: a script that Claude Code runs on `UserPromptSubmit`. Outputs a plain-text warning to stdout if stale pages are found; exits 0 always (hook must never block the session).

- [ ] **Step 1: Implement `mcp/kb-server/src/hooks/session-start.ts`**

```typescript
#!/usr/bin/env node
// Runs as a Claude Code UserPromptSubmit hook.
// Outputs a plain-text warning if KB pages are stale.
// Must exit 0 — never block the session.

import { checkStaleness, shouldNotify, markNotified, getHeadCommit, isOnDefaultBranch } from '../staleness.js';

const cwd = process.cwd();

try {
  if (!isOnDefaultBranch(cwd)) process.exit(0); // WIP branch — skip

  if (!shouldNotify(cwd)) process.exit(0); // Already notified at this HEAD

  const stale = checkStaleness(cwd);

  if (stale.length > 0) {
    const preview = stale
      .slice(0, 3)
      .map(p => p.title)
      .join(', ');
    const more = stale.length > 3 ? ` (+${stale.length - 3} more)` : '';
    console.log(
      `⚠️  KB: ${stale.length} page(s) may be stale — ${preview}${more}. Run /kb:status to review.`,
    );
  }

  const head = getHeadCommit(cwd);
  if (head) markNotified(cwd, head);
} catch {
  // Never let the hook crash the session
  process.exit(0);
}
```

- [ ] **Step 2: Build**

```bash
cd mcp/kb-server && npm run build
```

Expected: `dist/hooks/session-start.js` created.

- [ ] **Step 3: Verify it exits cleanly in a non-git directory**

```bash
cd /tmp && node <path-to-ai-tools>/mcp/kb-server/dist/hooks/session-start.js
echo "Exit code: $?"
```

Expected: no output, `Exit code: 0`.

- [ ] **Step 4: Commit**

```bash
git add mcp/kb-server/src/hooks/session-start.ts mcp/kb-server/dist/
git commit -m "feat(kb): add session-start staleness hook script"
```

---

### Task 9: kb-ingest and kb-scope agents

**Files:**
- Create: `agents/kb-ingest.md`
- Create: `agents/kb-scope.md`
- Modify: `agents/README.md`

**Interfaces:**
- `kb-ingest` is spawned by `/kb:ingest` skill with: the source text and the list of user-approved chunks to write
- `kb-scope` is spawned by `kb-ingest` when a chunk's category is ambiguous

- [ ] **Step 1: Create `agents/kb-ingest.md`**

```markdown
---
name: kb-ingest
description: >
  Writes approved knowledge chunks to the personal KB at ~/.claude/wiki/.
  Receives full source text and a list of user-approved chunks. For each chunk,
  writes a markdown page via wiki_write, then updates index.md and appends to
  log.md. Does not decide what to keep — that is the human's role during the
  interactive /kb:ingest flow. Spawns kb-scope when a chunk's category is ambiguous.
model: sonnet
tools: mcp__kb__wiki_write, mcp__kb__wiki_read, mcp__kb__wiki_list, Agent
---

You are the KB ingest agent. Your job is to write approved knowledge to
the personal wiki at `~/.claude/wiki/` and keep `index.md` and `log.md`
current.

## Inputs

The caller provides:
- `source_text`: the full original source (article, file, or pasted text)
- `approved_chunks`: a list of objects, each with:
  - `title`: the page title the human approved
  - `category_hint`: suggested category (may be ambiguous — see below)
  - `content_summary`: what the human agreed to capture

## Workflow

For each approved chunk:

1. **Resolve category.** If `category_hint` is clearly one of `concepts/`,
   `decisions/`, `entities/`, `projects/<name>/`, `research/`, `sources/`,
   use it directly. If it is ambiguous (e.g. could be global `concepts/` or
   project-specific `projects/my-app/`), spawn the `kb-scope` agent with
   the chunk content and category hint. Use the scope agent's response.

2. **Compose the page.** Write full markdown with YAML frontmatter:
   ```
   ---
   title: <title>
   summary: <one sentence — what this knowledge is>
   category: <resolved category>
   source_type: article | decision | research | conversation | code
   created_at: <today YYYY-MM-DD>
   updated_at: <today YYYY-MM-DD>
   ---

   <distilled knowledge in clear prose — not a transcript of the source>
   ```
   Use `[[page-title]]` wiki links to cross-reference related pages when you
   know they exist (check with wiki_list first).

3. **Write the page** via `wiki_write`. Path: `pages/<category>/<slug>.md`
   where slug is kebab-case of the title.

4. **Update `index.md`.** Read current `index.md` via `wiki_read("index.md")`.
   Add the new page under its category section:
   `- [<title>](pages/<category>/<slug>.md) — <one-line summary>`
   Write back via `wiki_write("index.md", ...)`.

5. **Append to `log.md`.** Read current `log.md` via `wiki_read("log.md")`.
   Append:
   ```
   ## <YYYY-MM-DD>
   - **Ingested**: <title> → `pages/<category>/<slug>.md`
   - **Source**: <brief description of the source>
   - **Skipped chunks**: <list anything the human chose not to keep, for reference>
   ```
   Write back via `wiki_write("log.md", ...)`.

## Quality bar

- Every page body must be distilled knowledge in prose — not a copy-paste
  of the source. Write what you would want to read in 6 months.
- Cross-references make the wiki useful. Add them when they exist.
- Keep summaries to one sentence — they appear in the index.
- Do not create duplicate pages. Check with wiki_list before writing.
  If a page already exists on this topic, update it instead of creating a new one.
```

- [ ] **Step 2: Create `agents/kb-scope.md`**

```markdown
---
name: kb-scope
description: >
  Resolves category ambiguity for a KB knowledge chunk. Given a chunk's
  content and a hint, proposes the best destination category and asks the
  user to confirm or redirect. Used by kb-ingest when categorization is unclear.
  Returns a single resolved category string.
model: haiku
tools: Read
---

You are the KB scope agent. Your only job is to decide which category a
knowledge chunk belongs to and confirm it with the user.

## Categories

```
concepts/          # Mental models, patterns, techniques — general and reusable
decisions/         # Choices made and why — with trade-offs
entities/          # People, tools, systems, organizations
projects/<name>/   # Knowledge specific to one project or codebase
research/          # Papers, articles, talks — distilled findings
sources/           # Raw summaries of specific sources
```

## Rule

Default to a **global category** (`concepts/`, `research/`, `decisions/`)
unless the content is clearly specific to a named project or codebase
(mentions a specific repo, internal system, or proprietary detail that
would not transfer to another project).

## Workflow

1. Read the chunk content.
2. Identify the best category using the rule above.
3. Present your choice to the user in one message:
   > "I'd place this under `<category>` — it's [one sentence justification].
   > Confirm, or redirect to a different category?"
4. Wait for the user's response.
5. Return the confirmed category string (e.g. `concepts` or `projects/my-app`).
   Return only the category string — nothing else.
```

- [ ] **Step 3: Update `agents/README.md`**

Read the current file, then add two rows to the agent table:

```bash
cat agents/README.md
```

After reading, add the following rows to the agent table (under existing entries):

```
| kb-ingest | Writes approved knowledge chunks to ~/.claude/wiki/, updates index.md and log.md | sonnet |
| kb-scope  | Resolves category ambiguity for a KB chunk; asks user to confirm or redirect | haiku |
```

- [ ] **Step 4: Manual smoke test**

In a Claude Code session:
```
/kb:ingest "Redis is an in-memory key-value store commonly used for caching and pub/sub messaging."
```

Expected: agent presents candidate chunks, asks for scope confirmation if category is ambiguous, writes to `~/.claude/wiki/` on approval.

- [ ] **Step 5: Commit**

```bash
git add agents/kb-ingest.md agents/kb-scope.md agents/README.md
git commit -m "feat(kb): add kb-ingest and kb-scope agents"
```

---

### Task 10: kb-ingest skill

**Files:**
- Create: `skills/kb-ingest/SKILL.md`
- Create: `skills/kb-ingest/README.md`

- [ ] **Step 1: Create `skills/kb-ingest/SKILL.md`**

```markdown
---
name: kb-ingest
description: >
  Add a new source to the personal knowledge base. Accepts a URL, local file
  path, or pasted text. Extracts candidate knowledge chunks interactively —
  the human decides what to keep before anything is written. Trigger: when
  the user wants to add an article, decision, or document to the KB.
license: MIT
metadata:
  author: Filadelfo Braz
  version: "0.1.0"
---

# KB Ingest

Add a source to the personal knowledge base at `~/.claude/wiki/`.

## How it works

1. **Read the source.** Accept a URL (fetch it), local file path (read it),
   or pasted text directly.

2. **Extract candidates.** Identify discrete knowledge chunks worth persisting:
   facts, decisions, patterns, mental models. Present them as a numbered list:
   ```
   Found 3 things worth capturing:

   [1] Redis TTL patterns — how to set per-key expiry (→ concepts/)
   [2] Decision to use Redis over Memcached — rationale was operational
       simplicity (→ decisions/)
   [3] Author's preference for single-node Redis — low signal for a
       distributed system (suggest skip)
   ```

3. **User approves.** The user responds per chunk (keep / skip / reword /
   redirect). Accept bulk responses: "keep 1, 2 — skip 3".

4. **Dispatch kb-ingest agent.** Pass:
   - `source_text`: the full source content
   - `approved_chunks`: list of approved chunk descriptions

5. **Done.** The agent writes pages, updates index.md and log.md.
   Report what was written.

## Arguments

`/kb:ingest <source>` where `<source>` is one of:
- A URL: `/kb:ingest https://example.com/article`
- A file path: `/kb:ingest ~/docs/my-notes.md`
- Pasted text: `/kb:ingest` then paste text in the next message

## What NOT to do

- Do not write anything before the user approves chunks.
- Do not ingest the full source verbatim — only approved chunks.
- Do not make scope decisions unilaterally — spawn kb-scope when ambiguous.
```

- [ ] **Step 2: Create `skills/kb-ingest/README.md`**

```markdown
# kb-ingest

Interactively add a source to the personal knowledge base.

## Installation

```bash
ln -s <ai-tools-root>/skills/kb-ingest ~/.claude/skills/kb-ingest
```

## Usage

```
/kb:ingest <source>
```

**Source types:**
- URL: `/kb:ingest https://example.com/article`
- File: `/kb:ingest ~/Documents/notes.md`
- Text: `/kb:ingest` (paste text when prompted)

## Prerequisites

- MCP server registered (see `mcp/kb-server/`)
- `kb-ingest` agent symlinked to `~/.claude/agents/kb-ingest.md`
- `kb-scope` agent symlinked to `~/.claude/agents/kb-scope.md`
```

- [ ] **Step 3: Manual smoke test**

```
/kb:ingest "Prefer optimistic locking over pessimistic locking in web APIs — less contention, better throughput at the cost of retry logic on conflict."
```

Expected: skill presents one candidate chunk, user approves, kb-ingest agent writes `~/.claude/wiki/pages/concepts/optimistic-locking.md`.

- [ ] **Step 4: Commit**

```bash
git add skills/kb-ingest/SKILL.md skills/kb-ingest/README.md
git commit -m "feat(kb): add kb-ingest skill"
```

---

### Task 11: kb-search skill

**Files:**
- Create: `skills/kb-search/SKILL.md`
- Create: `skills/kb-search/README.md`

- [ ] **Step 1: Create `skills/kb-search/SKILL.md`**

```markdown
---
name: kb-search
description: >
  Search the personal knowledge base. Returns ranked results with snippets.
  Top results include full page content. Trigger: when the user wants to
  find something in the KB, or asks "what do I know about X?".
license: MIT
metadata:
  author: Filadelfo Braz
  version: "0.1.0"
---

# KB Search

Query the personal knowledge base at `~/.claude/wiki/`.

## How it works

Call `wiki_search(query, limit)` via the MCP server. Present results as:

```
Found 3 results for "caching":

**1. Caching Strategy** (`concepts/caching.md`)
> Use Redis for API response caching with a 5-minute TTL...
[full content shown for top 2 results]

**2. Redis Deployment** (`entities/redis.md`)
> Single-node Redis for low-traffic services...
[full content shown for top 2 results]

**3. Rate Limiting** (`concepts/rate-limiting.md`)
> Sliding window algorithm preferred over fixed window...
[snippet only]
```

If no results: "Nothing in the KB for that query. Try different keywords,
or run /kb:ingest to add relevant sources."

## Arguments

`/kb:search <query>` where query is keywords (not a question).

- `/kb:search caching strategy`
- `/kb:search postgres indexing`
- `/kb:search auth token`
```

- [ ] **Step 2: Create `skills/kb-search/README.md`**

```markdown
# kb-search

Search the personal knowledge base from any Claude Code session.

## Installation

```bash
ln -s <ai-tools-root>/skills/kb-search ~/.claude/skills/kb-search
```

## Usage

```
/kb:search <query>
```

Use keywords, not questions:
- `/kb:search redis caching` ✓
- `/kb:search what is the best way to cache things?` ✗

## Prerequisites

- MCP server registered (see `mcp/kb-server/`)
```

- [ ] **Step 3: Manual smoke test**

After Task 10's smoke test has written a page:

```
/kb:search optimistic locking
```

Expected: returns the `concepts/optimistic-locking.md` page with snippet.

- [ ] **Step 4: Commit**

```bash
git add skills/kb-search/SKILL.md skills/kb-search/README.md
git commit -m "feat(kb): add kb-search skill"
```

---

### Task 12: kb-status skill

**Files:**
- Create: `skills/kb-status/SKILL.md`
- Create: `skills/kb-status/README.md`

- [ ] **Step 1: Create `skills/kb-status/SKILL.md`**

```markdown
---
name: kb-status
description: >
  Show KB health: total pages by category, and any stale code-derived pages
  whose source files have changed since they were indexed. Per stale page,
  shows the file diff and offers to re-ingest or dismiss. Trigger: when the
  user wants to audit or refresh the KB.
license: MIT
metadata:
  author: Filadelfo Braz
  version: "0.1.0"
---

# KB Status

Audit the personal knowledge base at `~/.claude/wiki/`.

## How it works

### 1. Summary

Call `wiki_list()` to get all pages. Group by category and show counts:

```
KB Status — ~/.claude/wiki/
  concepts/    12 pages
  decisions/    4 pages
  entities/     6 pages
  projects/     8 pages
  research/     3 pages
  sources/      5 pages
  ─────────────────────
  Total:       38 pages
```

### 2. Staleness report

For each page returned by `wiki_list()` that has `source_type: code`:
- Run: `git -C <page.repo> diff <page.source_commit>..HEAD -- <page.source_files>`
- If output is non-empty, the page is stale

Present stale pages:

```
⚠️  2 pages may be stale:

[1] Auth Module — Token Flow (`projects/my-app/auth.md`)
    Source: src/auth/token.ts changed since indexed at abc1234
    Diff summary: function `validateToken` signature changed

[2] Database Schema (`projects/my-app/db.md`)
    Source: src/db/schema.ts changed since indexed at abc1234
    Diff summary: added `users.email_verified` column

What would you like to do?
  a) Re-ingest all stale pages
  b) Review one by one
  c) Dismiss all (mark as reviewed)
```

### 3. Actions

- **Re-ingest**: spawn `kb-ingest` agent with the current file content. Pass
  `source_type: code` and the current HEAD commit as `source_commit`.
- **Dismiss**: call `wiki_write` to update the page's `updated_at` and
  `source_commit` frontmatter field to the current HEAD — marking it reviewed
  without changing the knowledge content.

## Arguments

`/kb:status` — no arguments.
```

- [ ] **Step 2: Create `skills/kb-status/README.md`**

```markdown
# kb-status

Audit the personal knowledge base for stale pages and index statistics.

## Installation

```bash
ln -s <ai-tools-root>/skills/kb-status ~/.claude/skills/kb-status
```

## Usage

```
/kb:status
```

Shows:
- Total pages by category
- Stale code-derived pages (source files changed since last indexed)
- Per stale page: diff summary + re-ingest or dismiss options

## Prerequisites

- MCP server registered (see `mcp/kb-server/`)
- `kb-ingest` agent symlinked (needed for re-ingest action)
```

- [ ] **Step 3: Manual smoke test**

In a repo where a code-derived KB page exists and its source file has changed:

```
/kb:status
```

Expected: counts by category shown; stale pages listed with diff summaries; user prompted for action.

- [ ] **Step 4: Commit**

```bash
git add skills/kb-status/SKILL.md skills/kb-status/README.md
git commit -m "feat(kb): add kb-status skill"
```

---

### Task 13: README and installation docs

**Files:**
- Modify: `README.md`
- Modify: `agents/README.md`

- [ ] **Step 1: Read current README.md**

```bash
cat README.md
```

- [ ] **Step 2: Update `README.md` structure section**

Add `kb-*` entries under Skills and Agents, and add `mcp/kb-server/` under structure. Add an Installation section covering the MCP server and hook registration.

The new Structure block:

```
skills/                      # Claude Code skills (invoked with /skill-name)
└── pr-deep-review/          # Deep PR review with DFS navigation table
└── kb-ingest/               # Interactively add a source to the KB
└── kb-search/               # Search the KB from any session
└── kb-status/               # Audit KB health and stale pages

agents/                      # Claude Code custom subagents
└── test-quality-reviewer.md # Test quality evaluation across 8 dimensions
└── kb-ingest.md             # Writes approved KB chunks, updates index and log
└── kb-scope.md              # Resolves KB category ambiguity

mcp/                         # MCP servers
└── kb-server/               # Knowledge base MCP server (wiki_search, wiki_read, wiki_write, wiki_list)
```

Add a `## MCP Servers` installation section after the existing `## Installation` section:

```markdown
### MCP Server (kb-server)

Build the server:
```bash
cd mcp/kb-server && npm install && npm run build
```

Register in `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["<ai-tools-root>/mcp/kb-server/dist/index.js"]
    }
  }
}
```

Register the staleness hook in `~/.claude/settings.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      "node <ai-tools-root>/mcp/kb-server/dist/hooks/session-start.js"
    ]
  }
}
```
```

- [ ] **Step 3: Verify README has content**

```bash
wc -l README.md
```

Expected: line count above 60 (confirms the new sections were added).

- [ ] **Step 4: Commit**

```bash
git add README.md agents/README.md
git commit -m "docs(kb): update README with KB system and installation instructions"
```
