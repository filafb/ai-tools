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
/brag                                  # since last run (or last 7 days on first run), through yesterday
/brag "context summary"                # same range, with upfront framing
/brag --since 2026-06-01               # custom start date, through yesterday
/brag --since 2026-06-01 "summary"    # custom start date + framing
```

## Workflow

### 1. Parse arguments

Extract from the skill arguments:
- `since_date`: value of `--since` flag if provided; otherwise computed from last-run state (see below)
- `context_summary`: any quoted string argument (may be absent)

The gather window always ends the day before today, never today itself (today's
activity is still in progress and would look incomplete). Compute:
```bash
date -v-1d +%Y-%m-%d   # macOS — this is UNTIL_DATE
```

**If `--since` was explicitly provided**, use that value as `since_date` and skip
the state file entirely — an explicit flag always wins.

**Otherwise, read the last-run state file** to pick up where the previous run left off:
```bash
cat ~/.claude/brag/last_run.json 2>/dev/null
```
- If the file exists and has a `last_run_date` field, compute `since_date` as that
  date plus one day:
  ```bash
  date -v+1d -j -f %Y-%m-%d LAST_RUN_DATE +%Y-%m-%d   # macOS
  ```
- If the file does not exist (first run ever), fall back to today minus 7 days:
  ```bash
  date -v-7d +%Y-%m-%d   # macOS
  ```

**If the computed `since_date` is after `until_date`** (e.g. `/brag` was already
run today), skip the gather/interview/write steps entirely and tell the user:
```
Already up to date — last run covered through LAST_RUN_DATE.
```
Then stop.

### 2. Invoke brag-documenter (gather mode)

Dispatch the `brag-documenter` agent with this prompt (replace values in CAPS):

```
{"mode":"gather","since_date":"SINCE_DATE","until_date":"UNTIL_DATE","context_summary":"CONTEXT_SUMMARY"}
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

If zero topics were accepted, say so and skip step 4 (do not invoke the write
agent) — but still proceed to step 5 to update the last-run state, since the
window was gathered and reviewed even though nothing was added.

### 4. Invoke brag-documenter (write mode)

Dispatch the `brag-documenter` agent with:
```
{"mode":"write","approved_entries":[APPROVED_ENTRIES_JSON],"brag_doc_path":"~/Documents/brag/brag.md"}
```

Wait for the agent to return `"done"`.

### 5. Update last-run state

Record `until_date` (from step 1) as the new last-run date, so the next
invocation picks up the day after:
```bash
mkdir -p ~/.claude/brag
echo '{"last_run_date":"UNTIL_DATE"}' > ~/.claude/brag/last_run.json
```

Do this even if zero topics were accepted in the interview — an empty window
still counts as covered and should not be re-gathered next time.

### 6. Confirm

```
Brag doc updated: ~/Documents/brag/brag.md
Added N entries.
```

## What NOT to do

- Do not start the interview before the gather agent has returned.
- Do not skip the interview — every topic must be presented to the user.
- Do not write to the brag doc before the interview is complete.
- Do not fabricate evidence — only use what the gather agent returned.
