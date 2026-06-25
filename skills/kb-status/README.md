# kb-status

Audit the personal knowledge base for stale pages and index statistics.

## Installation

```bash
ln -s <ai-tools-root>/skills/kb-status ~/.claude/skills/kb-status
```

## Usage

```
/kb:status
```

Shows:
- Total pages by category
- Stale code-derived pages (source files changed since last indexed)
- Per stale page: diff summary + re-ingest or dismiss options

## Prerequisites

- MCP server registered (see `mcp/kb-server/`)
- `kb-ingest` agent symlinked (needed for re-ingest action)
