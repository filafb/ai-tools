# Brag Documenter — Design Spec

**Date:** 2026-06-29
**Status:** Approved

---

## Overview

A `/brag` skill + `brag-documenter` agent that maintains a single, persistent brag document. On each run it queries all configured sources for the last N days, clusters findings into topics, pre-frames each topic with company values and role alignment, runs an interactive interview with the user, then merges approved entries into the existing brag doc — grouping new entries with related existing ones rather than always appending.

Audience: primarily the user themselves, but also used for 1:1s with manager and performance review writing.

---

## Architecture

Option B: skill orchestrates, agent does headless work.

```
/brag skill (main conversation thread)
  │
  ├── invoke brag-documenter (gather mode)
  │     queries all sources in parallel
  │     clusters into topics
  │     pre-frames each with values + role alignment
  │     returns structured topic list
  │
  ├── interview loop (in main thread)
  │     presents each topic one at a time
  │     user: Accept / Edit / Skip
  │     accumulates approved entries with edits
  │
  └── invoke brag-documenter (write mode)
        reads existing brag doc
        merges new entries into existing sections
        creates new sections only when no existing section fits
        writes updated doc back
```

The agent has two modes, signaled by the input it receives:
- **gather**: returns `BragTopicList` (structured JSON)
- **write**: returns updated markdown doc

---

## Data Sources

| Source | Method | What it fetches |
|--------|--------|----------------|
| GitHub | `gh` CLI | PRs opened/merged, issues closed, review comments left |
| Linear | `linear-mcp` MCP | Issues completed or moved to in-review, comments on others' issues |
| Slack | `slack` MCP | Threads where user posted substantively (not just reactions); DMs excluded |
| Notion | `notion` MCP | Pages created or last edited by user |
| Granola | Read `~/Library/Application Support/Granola/cache-v6.json` | Meeting transcripts (state.transcripts) |
| Google Calendar | `gcalcli` CLI | Meetings attended; flags recurring vs. one-off |

Default time window: last 7 days. Overridable at invocation (`/brag --since 2026-06-01`).

---

## Gather Phase

The agent queries all sources in parallel. For each raw finding it:

1. Extracts the core fact (what happened, what was done)
2. Attaches evidence: URL, issue ID, channel link, transcript excerpt — whatever is linkable
3. Clusters related findings into a single topic (e.g., multiple Slack messages + a Linear issue + a PR all about the same feature become one topic)
4. Pre-frames the topic against company values and SE role expectations:
   - Maps to 1-3 relevant values
   - Maps to relevant role expectations (e.g., "Staff — incident ownership")
   - Flags gaps when relevant (e.g., no post-mortem written after an incident)

Output is a `BragTopicList`: ordered list of topics, each with:
```json
{
  "title": "Led incident response for auth service outage",
  "summary": "Coordinated 3 teams, restored service in 47 min.",
  "evidence": [
    { "label": "INC-142", "url": "https://linear.app/..." },
    { "label": "#incidents thread Jun 25", "url": "https://slack.com/..." }
  ],
  "values_alignment": ["Customer obsession", "Reliability"],
  "role_alignment": ["Staff — incident ownership"],
  "gap": "No post-mortem written yet"
}
```

---

## Interview Phase

Runs in the main conversation thread (not inside the agent). The skill presents each topic one at a time:

```
Topic: Led incident response for auth service outage
Summary: Coordinated 3 teams, restored service in 47 min.
Evidence: INC-142 · #incidents thread Jun 25
Values: Customer obsession, Reliability
Role: Staff — incident ownership
Gap: No post-mortem written yet

[A]ccept  [E]dit  [S]kip
```

User responses:
- **Accept** — entry goes in as-is
- **Edit** — user rewrites summary or adjusts framing; values/role alignment can also be corrected
- **Skip** — entry is dropped for this run (not saved)

The skill collects all accepted/edited entries before invoking the write phase.

### Upfront context

When invoking `/brag`, the user can optionally provide a context summary:

```
/brag "This week I was mostly focused on the auth migration and on-call rotation"
```

The agent uses this to prioritize topic ordering and framing during gather.

---

## Write Phase

The agent receives:
- The existing brag doc (full text)
- The list of approved entries from the interview

It then:
1. Parses the existing doc into sections
2. For each new entry, finds the best existing section to merge into (same project, theme, or time proximity)
3. If a matching section exists: appends or integrates the new entry there
4. If no section fits: creates a new section

Every entry in the doc carries evidence inline. No entry is ever evidence-free.

---

## Document Format

Single persistent file at a user-configured path (default: `~/Documents/brag/brag.md`).

Structure:
```markdown
# Brag Document

## [Theme or Project Name]

### [Entry title] — [Month Year]
[1-3 sentence summary of what was done and why it mattered.]
*Evidence: [label](url), [label](url)*
*Values: X, Y | Role: Z expectation*

### [Another entry under same theme]
...

## [Another Theme]
...
```

Sections are grouped by theme/project, not by time. Time appears per-entry, not as a section header. This means related work across different weeks is colocated, which is more useful for performance reviews.

---

## Company Values Cross-Check

Values and role expectations live in a separate file, not in the agent's system prompt:

```
~/.claude/brag/context.md
```

The agent reads this file at the start of every gather run. The user edits it directly to update values, add role expectations, or reflect a promotion. The agent never caches it — always reads fresh.

Suggested structure for `context.md`:

```markdown
## Company Values
- Customer obsession: ...
- Reliability: ...
- ...

## Software Engineer Role Expectations
### Staff
- Incident ownership: ...
- ...
### Senior
- ...
```

During gather, the agent maps each topic to relevant values and role expectations from this file. During the interview, the user can correct these mappings.

The goal is not completeness scoring — it is to surface the connection between daily work and what the company/role actually cares about, so the user can articulate it clearly in 1:1s and reviews.

---

## Skill Invocation

```
/brag                          # last 7 days, no context
/brag "context summary"        # last 7 days, with upfront framing
/brag --since 2026-06-01       # custom start date
/brag --since 2026-06-01 "summary"
```

---

## Files to Create

```
skills/brag/SKILL.md           # skill instructions
skills/brag/README.md          # installation + usage
agents/brag-documenter.md      # agent definition
~/.claude/brag/context.md      # company values + role expectations (user-maintained, not in repo)
```

The skill and agent are separate artifacts. The skill handles interaction; the agent handles data fetching and document writing.

---

## Out of Scope

- Automatic scheduling (e.g., run every Monday) — user invokes manually
- Multi-user or shared brag docs
- Granola full meeting notes (only transcripts from local cache; Supabase-stored notes are not fetched)
- Slack DMs (only public/private channel threads)
