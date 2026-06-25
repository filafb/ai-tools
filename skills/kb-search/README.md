# kb-search

Search the personal knowledge base from any Claude Code session.

## Installation

```bash
ln -s <ai-tools-root>/skills/kb-search ~/.claude/skills/kb-search
```

## Usage

```
/kb:search <query>
```

Use keywords, not questions:
- `/kb:search redis caching` ✓
- `/kb:search what is the best way to cache things?` ✗

## Prerequisites

- MCP server registered (see `mcp/kb-server/`)
