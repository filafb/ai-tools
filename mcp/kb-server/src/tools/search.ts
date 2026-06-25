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
