---
name: kb-status
description: >
  Show KB health: total pages by category, and any stale code-derived pages
  whose source files have changed since they were indexed. Per stale page,
  shows the file diff and offers to re-ingest or dismiss. Trigger: when the
  user wants to audit or refresh the KB.
license: MIT
metadata:
  author: Filadelfo Braz
  version: "0.1.0"
---

# KB Status

Audit the personal knowledge base at `~/.claude/wiki/`.

## How it works

### 1. Summary

Call `wiki_list()` to get all pages. Group by category and show counts:

```
KB Status — ~/.claude/wiki/
  concepts/    12 pages
  decisions/    4 pages
  entities/     6 pages
  projects/     8 pages
  research/     3 pages
  sources/      5 pages
  ─────────────────────
  Total:       38 pages
```

### 2. Staleness report

For each page returned by `wiki_list()` that has `source_type: code`:
- Run: `git -C <page.repo> diff <page.source_commit>..HEAD -- <page.source_files>`
- If output is non-empty, the page is stale

Present stale pages:

```
⚠️  2 pages may be stale:

[1] Auth Module — Token Flow (`projects/my-app/auth.md`)
    Source: src/auth/token.ts changed since indexed at abc1234
    Diff summary: function `validateToken` signature changed

[2] Database Schema (`projects/my-app/db.md`)
    Source: src/db/schema.ts changed since indexed at abc1234
    Diff summary: added `users.email_verified` column

What would you like to do?
  a) Re-ingest all stale pages
  b) Review one by one
  c) Dismiss all (mark as reviewed)
```

### 3. Actions

- **Re-ingest**: spawn `kb-ingest` agent with the current file content. Pass
  `source_type: code` and the current HEAD commit as `source_commit`.
- **Dismiss**: call `wiki_write` to update the page's `updated_at` and
  `source_commit` frontmatter field to the current HEAD — marking it reviewed
  without changing the knowledge content.

## Arguments

`/kb:status` — no arguments.
