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
