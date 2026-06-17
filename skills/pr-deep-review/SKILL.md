---
name: pr-deep-review
description: >
  Deep PR review that produces three outputs: a test quality analysis
  (behavioral vs implementation, coverage gaps, untested edge cases), a
  DFS navigation table (entry point → dependencies, with bugs/smells/
  regressions inline), and a legend of all findings with line-number
  references. Use when the user asks for a thorough PR review, wants to
  navigate code file by file, or asks to review a specific PR number.
license: MIT
metadata:
  author: Filadelfo
  version: "0.1.0"
---

# PR Deep Review

A skill for producing a structured, navigable review of a pull request.
The output is designed for interactive use: the reviewer reads files in
the suggested order and has all findings at hand without switching context.

---

## When to apply

Use this skill when the user:

- Asks for a PR review (with or without a PR number)
- Wants to review code file by file and needs a navigation guide
- Asks for bugs, smells, or regression risks in a diff

## When NOT to apply

- The user only wants a quick summary — use `/review` instead
- The user wants to review a single file they already have open

---

## How this skill works

### Step 1 — Identify the PR

If no PR number was given, run `gh pr list` and ask the user which one to
review. If a number was given, proceed directly.

Run in parallel:
- `gh pr view <number> --json title,body,author,baseRefName,headRefName,state,additions,deletions,changedFiles`
- `git diff <base>...HEAD --name-only` (or `gh pr diff <number>`) to get
  the list of changed files

### Step 2 — Read the code

Read every changed file in full. Do not rely solely on the diff — you need
the full file to reason about line numbers and surrounding context.

Use two passes:

**Pass 1 — types and pure utils first** (no I/O, no framework deps):
Read any type definition files and pure utility modules changed in the PR.
These give you vocabulary before you read the code that uses them.

**Pass 2 — DFS from the entry point**:
Identify the entry point (the command, handler, or exported function that
the PR adds or changes). Read it first, then follow each dependency it
calls in order — clients, services, utils — the way a debugger would step
through a call stack.

When you encounter a file you already read in Pass 1, do not re-read it;
just reference it in the table.

### Step 3 — Produce the review

Output three sections in this order:

---

#### Section 1 — PR Summary

Two to four sentences. What the PR does, what it touches, and any
companion work (other PRs, backend changes, infra).

---

#### Section 2 — Test Analysis

Delegate this section entirely to the `test-quality-reviewer` agent. Spawn
it using the Agent tool with `subagent_type: "test-quality-reviewer"`.

Pass it:
- The list of test files changed in the PR
- The list of source files those tests cover
- A list of new non-trivial source modules that have no test file

Wait for the agent to return and embed its output verbatim as Section 2.
Do not summarize or rewrite its findings.

---

#### Section 3 — Navigation Table

One row per file, in DFS order (entry point first, then its dependencies).
The "What to focus on" column describes what to pay attention to when
reading that file. The "Findings" column lists all bugs, smells, and
regression risks that belong to that file, inline.

**Table format:**

| # | File | What to focus on | Findings |
|---|------|-----------------|----------|

**Finding format rules:**

- Prefix each finding with its type tag: `**B{n}**` (bug), `**S{n}**`
  (code smell), `**R{n}**` (regression risk). Number sequentially across
  the whole table, not per file.
- Every finding must include a line number reference in the format
  `(line N)` or `(lines N–M)`. No finding without a line reference.
- When a finding spans two files (e.g. a root cause in file A that
  manifests in file B), place the root cause in file A's row with a note
  to revisit at the relevant line in file B, and place the consequence in
  file B's row back-referencing file A.
- Rows with no findings get `—` in the Findings column.

**Finding taxonomy:**

- **Bug**: incorrect behavior — wrong result, silent data loss, wrong
  assumption about API contract, off-by-one, incorrect sort order used
  for a correctness-sensitive loop, etc.
- **Code smell**: duplication, missing pagination, sequential calls that
  could be parallel, unsafe spread on large arrays, hardcoded value that
  should reference a variable, etc.
- **Regression risk**: change that removes an existing behavior (a log,
  a guard, a default) that something else may depend on; new required
  env vars that will silently break a deploy; operational risks on first
  run (rate limits, backfills, large datasets).

---

## Quality bar

A good review from this skill must:

1. Contain line numbers on every finding — no exceptions.
2. Name missing test cases as concrete inputs, not vague categories.
3. Place findings in the file where the reviewer will actually see them,
   not always in the entry-point file.
4. Cross-reference findings that span files rather than duplicating them.
5. Keep the "What to focus on" column about reading strategy, not findings
   — findings go in the Findings column.
6. Flag when a finding in one file only makes sense after reading another
   file — tell the reviewer to note it and come back.
