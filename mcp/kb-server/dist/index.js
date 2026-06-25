import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { handleWikiSearch } from './tools/search.js';
import { handleWikiRead } from './tools/read.js';
import { handleWikiWrite } from './tools/write.js';
import { handleWikiList } from './tools/list.js';
const server = new McpServer({
    name: 'kb',
    version: '1.0.0',
});
server.tool('wiki_search', 'Search the personal knowledge base with full-text search. Returns ranked results with snippets. Top 2 results include full page content.', {
    query: z.string().describe('Search query — use keywords, not a question'),
    limit: z.number().int().min(1).max(20).optional().default(10).describe('Max results to return'),
}, async ({ query, limit }) => {
    const results = handleWikiSearch(query, limit);
    return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
});
server.tool('wiki_read', 'Read the full content of a KB page by its path (relative to ~/.claude/wiki/pages/).', {
    path: z.string().describe('Page path, e.g. "concepts/caching.md" or "index.md"'),
}, async ({ path }) => {
    const result = handleWikiRead(path);
    if ('error' in result) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
    }
    return { content: [{ type: 'text', text: result.content }] };
});
server.tool('wiki_write', 'Write or update a KB page. Content must include YAML frontmatter with title, summary, category, source_type, created_at, updated_at. Pages under pages/ are auto-indexed; index.md and log.md at the root are written as-is.', {
    path: z.string().describe('Page path relative to ~/.claude/wiki/, e.g. "pages/concepts/caching.md" or "index.md"'),
    content: z.string().describe('Full markdown content including YAML frontmatter'),
}, async ({ path, content }) => {
    const result = handleWikiWrite(path, content);
    if (!result.success) {
        return { content: [{ type: 'text', text: `Error: ${result.message}` }], isError: true };
    }
    return { content: [{ type: 'text', text: result.message }] };
});
server.tool('wiki_list', 'List KB pages with titles and summaries. Optionally filter by category (e.g. "concepts", "decisions", "projects/my-app").', {
    category: z.string().optional().describe('Filter by category name'),
}, async ({ category }) => {
    const pages = handleWikiList(category);
    return {
        content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }],
    };
});
const transport = new StdioServerTransport();
await server.connect(transport);
