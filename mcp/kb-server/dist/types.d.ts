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
    path: string;
    content: string;
}
export interface SearchResult {
    path: string;
    title: string;
    summary: string;
    snippet: string;
    content?: string;
}
export interface StalePageRecord {
    path: string;
    title: string;
    repo: string;
    source_files: string[];
    source_commit: string;
}
