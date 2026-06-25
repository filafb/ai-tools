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
