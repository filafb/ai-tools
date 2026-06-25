# kb-ingest

Interactively add a source to the personal knowledge base.

## Installation

```bash
ln -s <ai-tools-root>/skills/kb-ingest ~/.claude/skills/kb-ingest
```

## Usage

```
/kb:ingest <source>
```

**Source types:**
- URL: `/kb:ingest https://example.com/article`
- File: `/kb:ingest ~/Documents/notes.md`
- Text: `/kb:ingest` (paste text when prompted)

## Prerequisites

- MCP server registered (see `mcp/kb-server/`)
- `kb-ingest` agent symlinked to `~/.claude/agents/kb-ingest.md`
- `kb-scope` agent symlinked to `~/.claude/agents/kb-scope.md`
