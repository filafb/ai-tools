# Knowledge Base Management — Design Spec

**Date:** 2026-06-23
**Status:** Approved

---

## Overview

A personal knowledge base system inspired by Andrej Karpathy's LLM Wiki pattern. Instead of re-deriving knowledge from raw sources on every query (RAG), the system compiles sources into a persistent, interlinked wiki of markdown pages that accumulates over time. SDLC agents can query and write to this wiki during their work, making it a shared, growing knowledge layer across the development loop.

---

## Core Concept

Three layers (following Karpathy's pattern):

1. **Raw sources** — original inputs: URLs, files, articles, papers, notes
2. **Wiki** — LLM-maintained markdown pages: entity pages, concept pages, decisions, project knowledge, research summaries. The KB agent owns this layer entirely; humans read it and curate what gets added.
3. **Schema** — the conventions, page formats, and workflows that make the KB consistent across sessions. Lives in the MCP server config and agent instructions.

The wiki is a **single global scope** at `~/.claude/wiki/`. There is no per-repo wiki. Project-specific personal knowledge lives under `pages/projects/<name>/`. Formal repo documentation (ADRs, architecture docs) belongs in the repo itself — that is a separate concern.

---

## Storage Structure

```
~/.claude/wiki/
  wiki.db                    # SQLite + FTS5 index — rebuilt from markdown if lost
  index.md                   # catalog: every page with one-line summary + category
  log.md                     # chronological log of all ingest operations
  pages/
    concepts/                # patterns, mental models, ideas
    decisions/               # choices made and why
    entities/                # people, tools, systems
    projects/                # project-specific personal knowledge
      <project-name>/
    research/                # papers, articles, talks
    sources/                 # raw source summaries
```

Markdown files are the source of truth. The SQLite database (`wiki.db`) is a derived index — it can be rebuilt at any time by scanning the `pages/` directory. FTS5 (SQLite's built-in full-text search extension) provides ranked search with stemming across all page content, not just summaries.

### Page frontmatter

Every page carries YAML frontmatter:

```yaml
---
title: Auth Module — Token Flow
category: projects/my-app
source_type: code           # code | article | decision | research | conversation
source_files:               # only present when source_type is "code"
  - src/auth/token.ts
  - src/auth/session.ts
source_commit: a3f9c12      # only present when source_type is "code"
repo: ~/Code/my-app         # only present when source_type is "code"
created_at: 2026-06-23
updated_at: 2026-06-23
---
```

Pages with `source_type: code` are tracked for staleness. All other source types are not affected by code changes.

---

## Repo Structure (ai-tools)

```
ai-tools/
  mcp/
    kb-server/               # MCP server
      index.ts               # entry point
      tools/
        wiki_search.ts
        wiki_read.ts
        wiki_write.ts
        wiki_list.ts
      db.ts                  # SQLite + FTS5 setup, rebuild logic
      staleness.ts           # git-based staleness check
  skills/
    kb-ingest/
      SKILL.md
      README.md
    kb-search/
      SKILL.md
      README.md
    kb-status/
      SKILL.md
      README.md
  agents/
    kb-ingest.md             # extracts + filters knowledge, routes to pages
    kb-scope.md              # categorizes knowledge, prompts user when ambiguous
```

---

## MCP Server

Registered globally in `~/.claude/mcp.json`. Available in every Claude Code session regardless of working directory.

### Tools

| Tool | Signature | Description |
|---|---|---|
| `wiki_search` | `(query: string, limit?: number)` | FTS5 ranked search across all page content. Returns page path, title, summary, and a matched snippet per result. Single round trip — agents never touch the index directly. |
| `wiki_read` | `(path: string)` | Full markdown content of a specific page. Used after search surfaces a candidate. |
| `wiki_write` | `(path: string, content: string, metadata: PageMetadata)` | Write or update a page, persist to disk, reindex in SQLite. Creates parent directories as needed. |
| `wiki_list` | `(category?: string)` | List pages with titles and one-line summaries, optionally filtered by category. Used by `/kb:status`. |

### Search behaviour

`wiki_search` runs against an FTS5 virtual table that indexes `title + summary + content` for every page. Results are ranked by relevance. The tool returns:
- Summaries for all matches above threshold
- Full content for the top 2 results (configurable)

This means agents make one tool call and receive usable context without a follow-up `wiki_read`.

---

## Skills

### `/kb:ingest <source>`

Human-facing entry point for adding knowledge. Source can be a URL, local file path, or pasted text.

Flow:
1. `kb-ingest` agent reads the full source
2. Agent extracts **candidate knowledge chunks** — discrete facts, decisions, patterns worth persisting — and presents them as a numbered list with suggested destination pages and brief justifications
3. User approves, skips, rewords, or redirects each chunk (can respond in bulk: "keep 1, 2 — skip 3, 4")
4. For approved chunks, `kb-scope` agent determines category; if ambiguous between global and project-specific, it asks the user with a suggestion
5. `wiki_write` is called only for approved chunks
6. `index.md` and `log.md` are updated

The log records both what was kept and what was skipped, preserving the option to revisit a source later.

### `/kb:search <query>`

Queries the KB via `wiki_search`. Returns ranked results with snippets. Available from any working directory.

### `/kb:status`

Shows:
- Total pages by category
- Pages flagged as stale (code-derived pages whose source files have changed)
- Per stale page: diff summary of what changed in the source files
- Actions per stale page: re-ingest (kb-ingest agent rewrites from current code) or dismiss (mark as reviewed)

---

## Agents

### `kb-ingest`

Handles the extraction and write phase of ingest. Receives a source (text or file content) and a list of user-approved chunk descriptions.

Responsibilities:
- Write each approved chunk as a wiki page (new or updated)
- Maintain internal cross-references between pages (wiki links)
- Append a structured entry to `log.md`
- Update `index.md` with new or modified pages

Does not decide what to keep — that is the human's role during the interactive `/kb:ingest` flow.

### `kb-scope`

Called when a chunk's categorization is ambiguous. Analyses the content, proposes a destination (e.g., `concepts/caching-strategy.md` vs `projects/my-app/caching.md`), and asks the user to confirm or redirect.

Rule: defaults to global (`concepts/`, `research/`, `decisions/`) unless the content is clearly specific to one project or codebase.

---

## Staleness Tracking

Only pages with `source_type: code` are tracked for staleness.

### Detection

At session start, a `UserPromptSubmit` hook runs a lightweight check:

```
1. Is the current branch the default branch (main/master)?
   → No: skip staleness check entirely (WIP branch)
   → Yes: continue

2. For each code-derived KB page:
   git -C <repo> diff <source_commit>..HEAD -- <source_files>
   → any output? flag page as stale

3. If stale pages found:
   → surface once per session:
     "2 KB pages may be stale (auth/token-flow.md, db/schema.md). Run /kb:status to review."
   → store last_suggested_at_commit = HEAD in wiki.db to avoid re-surfacing until HEAD moves
```

The suggestion fires **once per HEAD position** on the default branch. It does not nag on WIP branches.

### Resolution

`/kb:status` lists stale pages with diff summaries. Per page, the user can:
- **Re-ingest**: `kb-ingest` agent reads the current source files and rewrites the page
- **Dismiss**: mark as reviewed (no knowledge-relevant change in the diff)

---

## SDLC Integration

Existing SDLC skills and agents call `wiki_search` and `wiki_write` during their work. No changes are required to the SDLC agents themselves — they gain KB access simply by having the MCP server available.

| SDLC point | KB read | KB write |
|---|---|---|
| `brainstorming` | reads for existing patterns, prior decisions | writes chosen approach + trade-offs |
| `writing-plans` | reads for patterns to follow | — |
| `pr-deep-review` | reads for known patterns, prior findings | writes key findings, newly observed patterns |
| `test-quality-reviewer` | reads for known edge cases | — |
| `finishing-a-development-branch` | — | writes decisions made during the branch |

---

## Installation

```bash
REPO=<ai-tools-root>

# Skills
ln -s "$REPO/skills/kb-ingest"  ~/.claude/skills/kb-ingest
ln -s "$REPO/skills/kb-search"  ~/.claude/skills/kb-search
ln -s "$REPO/skills/kb-status"  ~/.claude/skills/kb-status

# Agents
ln -s "$REPO/agents/kb-ingest.md"  ~/.claude/agents/kb-ingest.md
ln -s "$REPO/agents/kb-scope.md"   ~/.claude/agents/kb-scope.md

# MCP server (add to ~/.claude/mcp.json)
{
  "mcpServers": {
    "kb": {
      "command": "node",
      "args": ["<ai-tools-root>/mcp/kb-server/index.js"]
    }
  }
}

# Session-start hook (add to ~/.claude/settings.json)
{
  "hooks": {
    "UserPromptSubmit": ["node <ai-tools-root>/mcp/kb-server/staleness-check.js"]
  }
}
```

---

## Out of scope

- Per-repo wiki (formal project docs belong in the repo as ADRs)
- Automatic code-sync (the KB captures *your understanding*, not a mirror of the code)
- Embedding-based semantic search (FTS5 is sufficient at personal KB scale)
- Multi-user or shared KB
