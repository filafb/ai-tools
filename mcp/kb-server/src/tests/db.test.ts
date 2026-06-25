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
