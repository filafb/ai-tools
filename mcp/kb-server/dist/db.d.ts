import Database from 'better-sqlite3';
import type { PageFrontmatter, StalePageRecord } from './types.js';
declare function getDb(): Database.Database;
export declare function resetDb(): void;
export declare function upsertPage(path: string, fm: PageFrontmatter, body: string): void;
export declare function deletePage(path: string): void;
export declare function getPage(path: string): {
    frontmatter: PageFrontmatter;
} | undefined;
export declare function searchFts(query: string, limit: number): Array<{
    path: string;
    title: string;
    summary: string;
    snippet: string;
}>;
export declare function listPages(category?: string): Array<{
    path: string;
    title: string;
    summary: string;
    category: string;
}>;
export declare function getCodeDerivedPages(): StalePageRecord[];
export declare function getMetaValue(key: string): string | undefined;
export declare function setMetaValue(key: string, value: string): void;
export declare function rebuildFromDisk(pagesDir: string): void;
export { getDb };
