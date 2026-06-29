# Brag Documenter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/brag` skill and `brag-documenter` agent that maintain a single persistent brag document by gathering work evidence from 6 sources, running a values-aligned interactive interview, and merging approved entries into the doc.

**Architecture:** A skill orchestrates in the main thread: invoke agent (gather mode) → interactive interview → invoke agent (write mode). The agent is a headless worker handling all data fetching and document merging. Company values and role expectations live in `config/brag/context.md` (version-controlled), symlinked to `~/.claude/brag/context.md` (stable path the agent reads at runtime).

**Tech Stack:** Claude Code agents and skills (markdown + YAML frontmatter), `gh` CLI, `gcalcli`, Slack MCP (`mcp__plugin_slack_slack__*`), Linear MCP (`linear-mcp` npm package), Notion MCP (remote OAuth), Granola local cache JSON at `~/Library/Application Support/Granola/cache-v6.json`.

## Global Constraints

- Agent model tier alias: `sonnet` — never a version ID
- Context file the agent always reads: `~/.claude/brag/context.md`
- Brag doc default path: `~/Documents/brag/brag.md`
- Default time window: last 7 days (computed as today minus 7 days, ISO 8601)
- Evidence is required on every entry — no entry is ever evidence-free
- Brag doc sections are grouped by theme/project, not by time

---

### Task 1: Context file

**Files:**
- Create: `config/brag/context.md`
- Modify: `README.md` (add config/brag/ to structure overview)

**Interfaces:**
- Produces: `~/.claude/brag/context.md` (via symlink) — read by `brag-documenter` agent at gather time

- [ ] **Step 1: Create `config/brag/context.md`**

```markdown
# Brag Context

This file is read by the brag-documenter agent every time it runs.
Edit it directly in the repo — changes take effect on the next `/brag` run.

## Company Values

- **[Value name]:** [What this means in practice — one sentence]
- **[Value name]:** [What this means in practice — one sentence]
- **[Value name]:** [What this means in practice — one sentence]

## Software Engineer Role Expectations

### Staff Software Engineer
- **[Expectation]:** [Description of what "good" looks like at this level]
- **[Expectation]:** [Description]

### Senior Software Engineer
- **[Expectation]:** [Description of what "good" looks like at this level]
- **[Expectation]:** [Description]
```

- [ ] **Step 2: Create symlink and directory**

```bash
mkdir -p ~/.claude/brag
ln -sf "$(pwd)/config/brag/context.md" ~/.claude/brag/context.md
ls -la ~/.claude/brag/context.md
```

Expected output: a symlink pointing to the repo file.

- [ ] **Step 3: Fill in real values**

Open `config/brag/context.md` and replace all placeholder text with the actual company values and role expectations. Use the content already shared during brainstorming.

- [ ] **Step 4: Commit**

```bash
git add config/brag/context.md
git commit -m "feat(brag): add context file with company values and role expectations"
```

---

### Task 2: brag-documenter agent

**Files:**
- Create: `agents/brag-documenter.md`
- Modify: `agents/README.md` (add row to table)

**Interfaces:**
- Consumes (gather mode): `{ mode: "gather", since_date: "YYYY-MM-DD", context_summary?: string }`
- Produces (gather mode): JSON string — `{ "topics": [BragTopic, ...] }`
- Consumes (write mode): `{ mode: "write", approved_entries: [BragTopic, ...], brag_doc_path: string }`
- Produces (write mode): the string `"done"`

BragTopic shape:
```json
{
  "title": "string — imperative phrase",
  "summary": "string — 1-2 sentences",
  "evidence": [{ "label": "string", "url": "string" }],
  "values_alignment": ["string"],
  "role_alignment": ["string"],
  "gap": "string (optional)"
}
```

- [ ] **Step 1: Create `agents/brag-documenter.md`**

```markdown
---
name: brag-documenter
description: >
  Gathers work evidence from GitHub, Linear, Slack, Notion, Granola, and Google Calendar
  for a given time window; clusters findings into topics; pre-frames each topic with
  company values and role alignment; then merges approved entries into a persistent brag
  document. Invoked by the /brag skill in two modes: gather (returns BragTopicList JSON)
  and write (updates brag.md on disk).
model: sonnet
tools: Read, Write, Bash, mcp__plugin_slack_slack__slack_search_public_and_private, mcp__plugin_slack_slack__slack_read_thread, mcp__plugin_slack_slack__slack_read_channel
---

You are the brag-documenter agent. You run in one of two modes based on the JSON input you receive. Your final output is your return value — not a message to a human.

## Mode detection

Parse the JSON object in your input.
- If `mode` is `"gather"` → run the Gather workflow.
- If `mode` is `"write"` → run the Write workflow.

---

## Gather workflow

**Input fields:**
- `since_date`: ISO 8601 date string (e.g. `"2026-06-22"`)
- `context_summary`: optional string the user provided at invocation
- `context_file`: path to read values/roles from (default: `~/.claude/brag/context.md`)

### Step 1 — Read context

Read `~/.claude/brag/context.md`. Keep the content in memory — you will use it in the framing step.

### Step 2 — Query all sources in parallel

Make as many tool calls as possible in the same round-trip. Replace `SINCE_DATE` with the value of `since_date` in every command.

**GitHub (Bash):**
```bash
# PRs you authored
gh pr list --author @me --state all --json number,title,url,mergedAt,createdAt --limit 50 2>/dev/null | jq --arg d "SINCE_DATE" '[.[] | select((.createdAt // "") >= $d or (.mergedAt // "") >= $d)]'

# Issues you closed
gh issue list --assignee @me --state closed --json number,title,url,closedAt --limit 50 2>/dev/null | jq --arg d "SINCE_DATE" '[.[] | select((.closedAt // "") >= $d)]'

# PRs you reviewed
gh search prs --reviewed-by @me --json number,title,url,updatedAt --limit 30 2>/dev/null | jq --arg d "SINCE_DATE" '[.[] | select((.updatedAt // "") >= $d)]'
```

**Slack:**
Use `mcp__plugin_slack_slack__slack_search_public_and_private` with query:
`from:@me after:SINCE_DATE -in:random -in:general`

For each result thread with more than one message, read it with `slack_read_thread`. Only include threads where your contribution was substantive — more than a one-word reply or reaction. Exclude DMs.

**Linear:**
Use whatever Linear MCP tools are available (they will be prefixed `mcp__linear__*` or similar). List issues assigned to you that were updated after `since_date` and have status Completed, Done, or In Review. If no Linear tools are available, skip this source and note it.

**Notion:**
Use whatever Notion MCP tools are available. Search for pages created or last edited by you after `since_date`. If no Notion tools are available, skip this source and note it.

**Granola (Bash + Read):**
```bash
cat ~/Library/Application\ Support/Granola/cache-v6.json 2>/dev/null | jq --arg d "SINCE_DATE" '
  .state.transcripts // [] |
  [.[] | select((.startedAt // "") >= $d)] |
  [.[] | {title: .title, date: .startedAt, participants: .participants, transcript: .transcript}]
'
```
If the file does not exist or the command fails, skip Granola and note it.

**Google Calendar (Bash):**
```bash
gcalcli agenda "SINCE_DATE" "$(date +%Y-%m-%d)" --details all --nodeclined --nocolor --tsv 2>/dev/null
```
Parse the TSV output to list: meeting title, date, duration, attendee count. Flag meetings where you are the organizer.

### Step 3 — Cluster

Group related findings across sources into topics. A topic is a coherent unit of work. Use keyword overlap and date proximity to cluster. Examples:
- Multiple Slack threads + a Linear issue + a PR all mentioning the same feature name → one topic
- A calendar meeting + a Notion page + Granola transcript about the same project sync → one topic
- A standalone PR with no related signals → its own topic

### Step 4 — Frame

For each topic cluster, produce a BragTopic object:

1. `title`: imperative phrase describing what was accomplished (e.g. "Led incident response for auth outage", "Shipped payment retry logic")
2. `summary`: 1-2 sentences — what was done and why it mattered
3. `evidence`: all linkable signals — PR URLs, Linear issue IDs with URLs, Slack thread links, Notion page links, meeting names with dates. Every topic must have at least one evidence item.
4. `values_alignment`: 1-3 values from context.md that this topic demonstrates
5. `role_alignment`: 1-2 role expectations from context.md this topic demonstrates
6. `gap` (optional): an obvious follow-up not yet done (e.g. "No post-mortem filed after this incident", "No PR linked to Linear issue")

If `context_summary` was provided, use it to order topics (most relevant first) and to frame summaries accurately.

### Step 5 — Output

Return ONLY a JSON object — no preamble, no explanation, no markdown fencing:

```
{"topics":[{"title":"...","summary":"...","evidence":[{"label":"...","url":"..."}],"values_alignment":["..."],"role_alignment":["..."]},{"title":"...","summary":"...","evidence":[{"label":"...","url":"..."}],"values_alignment":["..."],"role_alignment":["..."],"gap":"..."}]}
```

---

## Write workflow

**Input fields:**
- `approved_entries`: array of BragTopic objects (with any user edits applied during interview)
- `brag_doc_path`: absolute path to the brag document (default: `~/Documents/brag/brag.md`)

### Step 1 — Read existing doc

Read `brag_doc_path`. If it does not exist, treat the current content as:
```
# Brag Document
```

### Step 2 — Parse sections

Identify all existing `## SectionName` headers and the entries (`### ...`) under each.

### Step 3 — Merge each entry

For each entry in `approved_entries`:

1. Find the best existing `## Section` to place it under. Match on: same project name, same domain keyword (incident, auth, migration, payments, etc.), same team or system name.
2. If a match exists: append the new entry under that section.
3. If no match: create a new `## Section` whose name is derived from the entry title (extract the main subject noun: "Led incident response for auth outage" → `## Incident Response`).

Entry markdown format:
```
### [title] — [Month YYYY]
[summary]
*Evidence: [label](url), [label](url)*
*Values: [values_alignment, comma-separated] | Role: [role_alignment, comma-separated]*
```

If `gap` is present, add a line after the evidence line:
```
*Gap: [gap]*
```

Extract Month YYYY from the evidence dates (use the earliest date among evidence items).

### Step 4 — Write

If the brag doc directory does not exist, create it:
```bash
mkdir -p "$(dirname BRAG_DOC_PATH)"
```

Write the complete updated document to `brag_doc_path`.

Return the string: `done`
```

- [ ] **Step 2: Add to `agents/README.md`**

Add a row to the table:
```markdown
| `brag-documenter` | Gathers work evidence from 6 sources, clusters into topics with values alignment, and merges approved entries into a persistent brag document. Invoked by /brag skill. |
```

- [ ] **Step 3: Symlink the agent**

```bash
ln -sf "$(pwd)/agents/brag-documenter.md" ~/.claude/agents/brag-documenter.md
ls -la ~/.claude/agents/brag-documenter.md
```

Expected: symlink pointing to the repo file.

- [ ] **Step 4: Commit**

```bash
git add agents/brag-documenter.md agents/README.md
git commit -m "feat(brag): add brag-documenter agent (gather + write modes)"
```

---

### Task 3: /brag skill

**Files:**
- Create: `skills/brag/SKILL.md`
- Create: `skills/brag/README.md`

**Interfaces:**
- Consumes: `/brag [--since YYYY-MM-DD] ["context summary"]`
- Consumes (from agent gather): JSON `{ "topics": [...] }` string
- Produces: updated brag document on disk (via write-mode agent invocation)

- [ ] **Step 1: Create `skills/brag/SKILL.md`**

```markdown
---
name: brag
description: >
  Maintains a personal brag document. Queries GitHub, Linear, Slack, Notion,
  Granola, and Google Calendar for recent work; runs an interactive interview
  where each finding is pre-framed with company values and role alignment;
  then merges approved entries into a single persistent brag doc.
  Trigger: when the user types /brag.
license: MIT
metadata:
  author: Filadelfo Braz
  version: "0.1.0"
---

# Brag

Maintain your brag document by gathering evidence from all work sources and
running a structured interview.

## Invocation

```
/brag                                  # last 7 days, no context
/brag "context summary"                # last 7 days, with upfront framing
/brag --since 2026-06-01               # custom start date
/brag --since 2026-06-01 "summary"    # custom start date + framing
```

## Workflow

### 1. Parse arguments

Extract from the skill arguments:
- `since_date`: value of `--since` flag, or today minus 7 days in `YYYY-MM-DD` format if not provided
- `context_summary`: any quoted string argument (may be absent)

To compute today minus 7 days:
```bash
date -v-7d +%Y-%m-%d   # macOS
```

### 2. Invoke brag-documenter (gather mode)

Dispatch the `brag-documenter` agent with this prompt (replace values in CAPS):

```
{"mode":"gather","since_date":"SINCE_DATE","context_summary":"CONTEXT_SUMMARY"}
```

If no context summary was provided, omit the `context_summary` field entirely.

Wait for the agent to return. Its output is a JSON string containing a `topics` array.

### 3. Run the interview

Parse the JSON topics array. For each topic, present it to the user in this format:

```
**[N/TOTAL] [title]**
[summary]

Evidence: [label1] · [label2] · ...
Values: [values_alignment joined with ", "]
Role: [role_alignment joined with ", "]
[Gap: [gap]]

**[A]ccept  [E]dit  [S]kip**
```

Wait for the user's response before presenting the next topic.

**Accept:** Add the topic to `approved_entries` unchanged.

**Edit:** Ask the user what they want to change. Accept their revised text.
Re-present the edited topic and ask for final confirmation (A/S only at this point).
Add the edited version to `approved_entries`.

**Skip:** Do not add to `approved_entries`. Move on.

Continue until all topics have been reviewed. Show a summary:
```
Interview complete. N topics accepted, M skipped.
Writing to brag doc...
```

If zero topics were accepted, say so and exit without invoking the write agent.

### 4. Invoke brag-documenter (write mode)

Dispatch the `brag-documenter` agent with:
```
{"mode":"write","approved_entries":[APPROVED_ENTRIES_JSON],"brag_doc_path":"~/Documents/brag/brag.md"}
```

Wait for the agent to return `"done"`.

### 5. Confirm

```
Brag doc updated: ~/Documents/brag/brag.md
Added N entries.
```

## What NOT to do

- Do not start the interview before the gather agent has returned.
- Do not skip the interview — every topic must be presented to the user.
- Do not write to the brag doc before the interview is complete.
- Do not fabricate evidence — only use what the gather agent returned.
```

- [ ] **Step 2: Create `skills/brag/README.md`**

```markdown
# /brag skill

Maintains a personal brag document by gathering evidence from GitHub, Linear,
Slack, Notion, Granola, and Google Calendar, running an interactive interview,
and merging approved entries into a single persistent doc.

## Prerequisites

- `gh` CLI — authenticated (`gh auth login`)
- `gcalcli` — installed and authenticated (`gcalcli init`)
- Slack MCP — configured in Claude Code
- Linear MCP (`linear-mcp`) — configured in Claude Code with `LINEAR_ACCESS_TOKEN`
- Notion MCP — configured in Claude Code (remote OAuth via `claude mcp login notion`)

## Installation

### 1. Symlink the agent

```bash
ln -sf ~/Code/ai-tools/agents/brag-documenter.md ~/.claude/agents/brag-documenter.md
```

### 2. Symlink the context file

```bash
mkdir -p ~/.claude/brag
ln -sf ~/Code/ai-tools/config/brag/context.md ~/.claude/brag/context.md
```

### 3. Fill in your context

Edit `~/Code/ai-tools/config/brag/context.md` with your company's actual values and your role's expectations.

### 4. Symlink this skill

```bash
ln -sf ~/Code/ai-tools/skills/brag ~/.claude/skills/brag
```

(Adjust the target path if your Claude Code skills directory differs.)

### 5. Create brag doc directory

```bash
mkdir -p ~/Documents/brag
```

## Usage

```
/brag
/brag "This week I focused on the auth migration"
/brag --since 2026-06-01
/brag --since 2026-06-01 "context here"
```

## Customization

- **Brag doc path:** Tell the agent a different path in the `/brag` invocation, or edit the default in `skills/brag/SKILL.md`.
- **Values/roles:** Edit `config/brag/context.md` — changes take effect on the next run.
```

- [ ] **Step 3: Symlink the skill directory**

```bash
mkdir -p ~/.claude/skills
ln -sf "$(pwd)/skills/brag" ~/.claude/skills/brag
ls -la ~/.claude/skills/brag
```

Expected: symlink pointing to `skills/brag/` in the repo.

- [ ] **Step 4: Commit**

```bash
git add skills/brag/SKILL.md skills/brag/README.md
git commit -m "feat(brag): add /brag skill with interview orchestration"
```

---

### Task 4: Root README and end-to-end smoke test

**Files:**
- Modify: `README.md` (add brag skill and agent to structure overview)

**Interfaces:**
- Consumes: everything built in Tasks 1–3
- Produces: verified working `/brag` invocation

- [ ] **Step 1: Update root README**

In `README.md`, add `brag-documenter` to the agents section and `brag` to the skills section in the structure overview.

- [ ] **Step 2: Verify symlinks**

```bash
ls -la ~/.claude/agents/brag-documenter.md
ls -la ~/.claude/brag/context.md
ls -la ~/.claude/skills/brag
```

All three should be valid symlinks.

- [ ] **Step 3: Verify context file is populated**

```bash
cat ~/.claude/brag/context.md
```

Expected: real company values and role expectations (not placeholder text).

- [ ] **Step 4: Smoke test — gather only**

In a Claude Code session, invoke `/brag` with a short time window:

```
/brag --since [date 2 days ago]
```

Verify:
- The skill parses the date correctly
- The gather agent is invoked and returns JSON with a `topics` array
- At least one topic appears (if there has been any GitHub/Slack/Linear activity)
- Each topic has `evidence` with at least one item
- Each topic has `values_alignment` drawn from your context.md

- [ ] **Step 5: Smoke test — full run**

Complete the interview for 1-2 topics (accept one, skip one). Verify:
- The interview presents topics one at a time with the correct format
- Accepting works, skipping works
- The write agent is invoked and returns `"done"`
- `~/Documents/brag/brag.md` exists and contains the accepted entry with evidence and values lines

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "feat(brag): complete brag-documenter skill and agent"
```

---

## Self-review

**Spec coverage:**
- [x] 6 data sources queried in gather mode
- [x] Context file version-controlled, symlinked
- [x] Values/role pre-framing before interview
- [x] Interview: Accept / Edit / Skip per topic
- [x] Evidence required on every entry
- [x] Single persistent brag doc, theme-grouped sections
- [x] Agent merges new entries into existing sections
- [x] `--since` flag and context summary argument
- [x] Gap flagging
- [x] Upfront context summary passed to gather agent

**Placeholder scan:** None found.

**Type consistency:** `BragTopic` shape defined in Task 2 interfaces is used verbatim in the skill's write-mode invocation JSON in Task 3. `approved_entries` field name is consistent across skill and agent.
