import { listPages } from '../db.js';
export function handleWikiList(category) {
    return listPages(category);
}
