# make-it-reviewable — design

- **Date:** 2026-07-09
- **Status:** Design approved; implementation pending.
- **Author:** Filadelfo (with Claude)

## Problem

A branch can be correct and still be miserable to review. The value that
turns a working branch into a *reviewable* one is discipline that no single
existing tool captures end to end: a spec that leads the history, a
dependency-ordered sequence of atomic commits whose messages explain what /
why / how, tests that fail for the right reason before they pass, and a
commit-by-commit audit whose fixes are folded back into the commit that
introduced them — not piled onto the tip. This is repeatable work; it should
be a skill.

## Goals

- Turn an implemented branch into a **reviewable** one: spec-first,
  dependency-ordered, atomic commits with what/why/how messages, audited
  commit by commit, opened as a PR with a commit-by-commit narrative.
- Encode the **safe history-rewrite mechanics** (backup → fold into the owning
  commit → verify the cumulative diff is only the intended change) as tested
  scripts, so the operation that most easily corrupts history is not done by
  hand.
- Be **portable**: no hard dependency on any plugin. The skill enforces the
  gates and owns the choreography; producing the spec/plan/implementation is
  delegated to whatever tooling the user has.

## Non-goals

- **Not** a spec/plan/implementation driver. The skill assumes the work is
  implemented (or drives it via the user's own tooling) and does not reimplement
  brainstorming, planning, or TDD scaffolding.
- **Not** a PR-body template owner. PR format follows the target repo's own
  instructions; the skill only guarantees a commit-by-commit narrative is added.
- **Not** a whole-PR reviewer. Final whole-branch review composes the existing
  `pr-deep-review` skill; the new `commit-auditor` agent covers only the
  per-commit dimension neither `pr-deep-review` nor `test-quality-reviewer` do.

## The rules the skill enforces

1. **Spec is the first commit** — when a design doc exists, it leads the
   history (commit #1). A choreography rule, not a blocking gate.
2. **Commit bodies explain what · why · how** — every commit's message covers
   all three. A body that only restates the diff (the *what*) is incomplete.
3. **TDD, with an honest red** — each unit lands red→green, where the red is a
   *behavioral* failure (a real assertion failing), **never** a
   "function/method not defined / not implemented" error. If a test references
   a symbol that does not exist yet, its **stub goes in the same commit as the
   test**, so the test fails on behavior, not on a missing name. A commit whose
   tests fail merely because a symbol is undefined is not a valid red and is a
   defect.
4. **Reviewable history** — atomic, dependency-ordered commits (no symbol used
   before the commit that introduces it); one concern per commit; minimal file
   overlap (a file is touched in one commit unless strictly necessary); no
   scaffolding, plans, or throwaway files shipped.
5. **Fold pre-push, append post-push** — the safety boundary. While the branch
   is unpushed, fixes found in review are *folded into the commit that
   introduced the code*. Once the branch is pushed (a PR exists / history is
   shared), fixes are *new commits* — never a history rewrite.
6. **Verify empirically** — every claim (a commit is correct, a test passes, a
   variable resolves) is backed by a command that actually ran.

## Architecture

Three artifacts, single responsibility each:

- **`make-it-reviewable` skill** — the conductor. Owns choreography, the review-and-fold
  loop, and the PR step; enforces the six rules; delegates spec/plan/impl.
- **`commit-auditor` agent** — the per-commit verifier. Read-only; returns
  ranked findings the skill embeds and acts on.
- **Helper scripts** — the tested mechanics the skill calls
  (`fold-into-commit.sh`, `commit-review-package.sh`).

Composition (reuse, do not rebuild):
- **Final whole-branch review** → the existing `pr-deep-review` skill.
- **Test-quality gate** → the existing `test-quality-reviewer` agent.

## Components

### 1. `make-it-reviewable` skill (`skills/make-it-reviewable/SKILL.md`)

Phases the skill actively drives:

1. **Choreograph** — reorder/squash the branch into dependency order; ensure the
   spec (if any) is commit #1; drop scaffolding; ensure each commit body carries
   what/why/how. Each rewrite is guarded by `fold-into-commit.sh`'s
   backup+verify discipline (below).
2. **Review-and-fold loop** — run `commit-review-package.sh base..head`, dispatch
   `commit-auditor`, triage findings (severity-ranked), and for each accepted fix
   call `fold-into-commit.sh <owning-commit> <files>`; then re-audit the touched
   commit. **Pre-push only.**
3. **Final whole-branch review** — compose `pr-deep-review`.
4. **PR** — open following the **target repo's own PR instructions**
   (`CLAUDE.md`/`CONTRIBUTING`), and **always add a commit-by-commit narrative**
   (one line per commit: what it does and why it's ordered there) regardless of
   the repo's template. **Post-push: append-only** per rule 5.

The skill states the six rules at the top as its operating contract, and it
reads (not assumes) whether the branch is pushed to pick fold vs. append.

### 2. `commit-auditor` agent (`agents/commit-auditor.md`)

- **Frontmatter:** `model: sonnet` (a reasoning-heavy verifier; override to
  `opus` for high-risk diffs), `tools: Read, Grep, Bash` (read-only + run checks).
- **Language-agnostic** — audits commits in any language; verifies by running
  whatever checks the repo provides.
- **Input (only what it needs):** a base..head range and the review package
  path — never the caller's conversation.
- **Behavior:** for each commit in order — read message + diff; **verify the
  message's claims against the actual code** (at that commit *and* cross-refs at
  HEAD); run available checks (tests/lint/build/render); confirm the TDD red is
  behavioral (rule 3); check body covers what/why/how (rule 2) and history rules
  (rule 4).
- **Output:** findings ranked most-severe first, each with `file:line`, a
  concrete failure scenario, and a tag — **CONFIRMED** (verified against code) vs
  **PLAUSIBLE** (not fully verifiable from the diff). Output is embeddable
  verbatim in the skill's turn.

### 3. Helper scripts (`skills/make-it-reviewable/scripts/`)

- **`fold-into-commit.sh <commit> [files…]`** — the safe rewrite. Records a
  backup branch; detaches at `<commit>`; applies the staged edits; amends;
  `rebase --onto` replays the rest; **verifies `git diff <backup>..HEAD` contains
  only the intended files**; restores and aborts on any mismatch. Refuses to run
  on a pushed branch (enforces rule 5).
- **`commit-review-package.sh <base> <head>`** — emits, to one file, the commit
  list + per-commit `diff -U10` + stat, for the auditor to read in one shot.

Both are unit-tested against throwaway git repos (red→green) — the concrete TDD
anchor, since the skill/agent bodies are prose.

### 4. Evals (the artifact-level tests)

Per repo convention, each artifact ships eval cases:
- **`skills/make-it-reviewable/evals/cases/`** — a **planted-defect branch**: a fixture
  git history with known issues (a fix piled on the tip instead of folded; a spec
  not ordered first; a commit whose test fails on an undefined symbol; a body
  missing the *why*). Pass = the skill's run surfaces and corrects them.
- **`agents/evals/commit-auditor/cases/`** — a small branch with planted
  per-commit defects; pass = the auditor reports them, correctly tagged
  CONFIRMED vs PLAUSIBLE, ranked by severity.

## File layout (in `ai-tools`)

```
skills/make-it-reviewable/
├── SKILL.md
├── README.md
├── scripts/
│   ├── fold-into-commit.sh
│   └── commit-review-package.sh
└── evals/cases/…
agents/
├── commit-auditor.md
└── evals/commit-auditor/cases/…
docs/superpowers/specs/2026-07-09-make-it-reviewable-design.md   # this doc
```

Plus: update root `README.md` structure overview and `agents/README.md` table
(repo convention for adding a skill/agent).

## Testing strategy

- **Scripts:** unit tests (bash) on throwaway repos, TDD red→green — the honest
  red per rule 3 (stub + test in one commit where a helper is referenced before
  it exists).
- **Skill + agent:** the eval cases above (planted-defect branches). This is how
  a prose skill is "tested" — behaviorally, against fixtures with known outcomes.

## Out of scope (future, if a need appears)

- A central/CI executor that runs `make-it-reviewable` non-interactively.
- Auto-generating the spec when none exists (belongs to spec tooling, not here).
- Language-specific TDD scaffolding (the skill enforces the rule; it does not
  scaffold tests).
