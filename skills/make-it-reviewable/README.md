# make-it-reviewable

Turns an implemented branch into a **reviewable** one: spec-first,
dependency-ordered atomic commits with what/why/how messages, audited commit
by commit (fixes folded into the commit that introduced them, not piled on
the tip), opened as a PR with a commit-by-commit narrative.

Design doc: [`docs/superpowers/specs/2026-07-09-make-it-reviewable-design.md`](../../docs/superpowers/specs/2026-07-09-make-it-reviewable-design.md)

## What it does

1. **Choreograph** — reorder/squash into dependency order, spec as commit #1,
   drop scaffolding, ensure every body carries what/why/how.
2. **Review-and-fold loop** — package the range
   (`scripts/commit-review-package.sh`), dispatch the `commit-auditor` agent,
   fold accepted fixes into their owning commit
   (`scripts/fold-into-commit.sh`), re-audit. Pre-push only.
3. **Final whole-branch review** — composes the `pr-deep-review` skill (which
   includes the `test-quality-reviewer` agent).
4. **PR** — follows the target repo's own PR instructions, always adding a
   commit-by-commit narrative.

The safety boundary: **fold pre-push, append post-push**. Once history is
shared, fixes are new commits — never a rewrite. `fold-into-commit.sh`
enforces this (refuses commits reachable from a remote), records a backup
branch, and verifies the cumulative diff contains only the intended files.

## Usage

```
/make-it-reviewable
```

Run it on a branch whose implementation is complete. It assumes the work is
done (or driven by your own spec/plan/TDD tooling) — it makes the *history*
reviewable; it does not implement.

## Installation

Symlink the skill directory into your Claude Code skills directory:

```bash
ln -s /Users/<you>/Code/ai-tools/skills/make-it-reviewable \
      ~/.claude/skills/make-it-reviewable
```

Also install the agent it dispatches:

```bash
ln -s /Users/<you>/Code/ai-tools/agents/commit-auditor.md \
      ~/.claude/agents/commit-auditor.md
```

## Layout

```
skills/make-it-reviewable/
├── SKILL.md                          # The conductor: six rules + four phases
├── README.md                         # This file
├── scripts/
│   ├── fold-into-commit.sh           # Guarded fold into the owning commit
│   ├── commit-review-package.sh      # One-file package of a base..head range
│   └── tests/                        # Bash unit tests (throwaway git repos)
└── evals/cases/                      # Planted-defect branch fixture
```

Run the script tests:

```bash
bash scripts/tests/test-fold-into-commit.sh
bash scripts/tests/test-commit-review-package.sh
```
