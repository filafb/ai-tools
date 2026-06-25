import { listPages } from '../db.js';

export function handleWikiList(
  category?: string,
): Array<{ path: string; title: string; summary: string; category: string }> {
  return listPages(category);
}
