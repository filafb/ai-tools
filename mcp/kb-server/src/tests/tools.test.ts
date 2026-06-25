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
