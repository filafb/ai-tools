---
name: kb-search
description: >
  Search the personal knowledge base. Returns ranked results with snippets.
  Top results include full page content. Trigger: when the user wants to
  find something in the KB, or asks "what do I know about X?".
license: MIT
metadata:
  author: Filadelfo Braz
  version: "0.1.0"
---

# KB Search

Query the personal knowledge base at `~/.claude/wiki/`.

## How it works

Call `wiki_search(query, limit)` via the MCP server. Present results as:

```
Found 3 results for "caching":

**1. Caching Strategy** (`concepts/caching.md`)
> Use Redis for API response caching with a 5-minute TTL...
[full content shown for top 2 results]

**2. Redis Deployment** (`entities/redis.md`)
> Single-node Redis for low-traffic services...
[full content shown for top 2 results]

**3. Rate Limiting** (`concepts/rate-limiting.md`)
> Sliding window algorithm preferred over fixed window...
[snippet only]
```

If no results: "Nothing in the KB for that query. Try different keywords,
or run /kb:ingest to add relevant sources."

## Arguments

`/kb:search <query>` where query is keywords (not a question).

- `/kb:search caching strategy`
- `/kb:search postgres indexing`
- `/kb:search auth token`
