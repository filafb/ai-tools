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
