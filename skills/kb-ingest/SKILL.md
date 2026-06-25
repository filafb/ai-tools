---
name: kb-ingest
description: >
  Add a new source to the personal knowledge base. Accepts a URL, local file
  path, or pasted text. Extracts candidate knowledge chunks interactively —
  the human decides what to keep before anything is written. Trigger: when
  the user wants to add an article, decision, or document to the KB.
license: MIT
metadata:
  author: Filadelfo Braz
  version: "0.1.0"
---

# KB Ingest

Add a source to the personal knowledge base at `~/.claude/wiki/`.

## How it works

1. **Read the source.** Accept a URL (fetch it), local file path (read it),
   or pasted text directly.

2. **Extract candidates.** Identify discrete knowledge chunks worth persisting:
   facts, decisions, patterns, mental models. Present them as a numbered list:
   ```
   Found 3 things worth capturing:

   [1] Redis TTL patterns — how to set per-key expiry (→ concepts/)
   [2] Decision to use Redis over Memcached — rationale was operational
       simplicity (→ decisions/)
   [3] Author's preference for single-node Redis — low signal for a
       distributed system (suggest skip)
   ```

3. **User approves.** The user responds per chunk (keep / skip / reword /
   redirect). Accept bulk responses: "keep 1, 2 — skip 3".

4. **Dispatch kb-ingest agent.** Pass:
   - `source_text`: the full source content
   - `approved_chunks`: list of approved chunk descriptions

5. **Done.** The agent writes pages, updates index.md and log.md.
   Report what was written.

## Arguments

`/kb:ingest <source>` where `<source>` is one of:
- A URL: `/kb:ingest https://example.com/article`
- A file path: `/kb:ingest ~/docs/my-notes.md`
- Pasted text: `/kb:ingest` then paste text in the next message

## What NOT to do

- Do not write anything before the user approves chunks.
- Do not ingest the full source verbatim — only approved chunks.
- Do not make scope decisions unilaterally — spawn kb-scope when ambiguous.
