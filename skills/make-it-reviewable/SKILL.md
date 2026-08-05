---
name: make-it-reviewable
description: >
  Use when an implemented branch needs to become a reviewable one before a PR
  is opened — commits are out of order, messages only restate diffs, fixes are
  piled on the tip, scaffolding is committed, or the user asks to clean up a
  branch, rewrite history for review, or open a PR reviewers can follow
  commit by commit.
license: MIT
metadata:
  author: Filadelfo
  version: "0.1.0"
---

# Make It Reviewable

Turn an implemented branch into a reviewable one: spec-first,
dependency-ordered atomic commits with what/why/how messages, audited commit
by commit with fixes folded into the commit that introduced them, opened as a
PR with a commit-by-commit narrative.

This skill is the conductor. It does **not** produce the spec, plan, or
implementation — that is the user's own tooling. It choreographs history,
runs the review-and-fold loop, and opens the PR.

## The six rules (operating contract)

1. **Spec is the first commit.** When a design doc exists, it leads the
   history. A choreography rule, not a blocking gate.
2. **Commit bodies explain what · why · how.** A body that only restates the
   diff (the *what*) is incomplete.
3. **TDD with an honest red.** Each unit lands red→green where the red is a
   *behavioral* failure (a real assertion failing) — never "function/method
   not defined". A test referencing a symbol that doesn't exist yet gets its
   **stub in the same commit as the test**.
4. **Reviewable history.** Atomic, dependency-ordered commits (no symbol used
   before the commit that introduces it); one concern per commit; minimal
   file overlap; no scaffolding, plans, or throwaway files shipped.
5. **Fold pre-push, append post-push.** While the branch is unpushed, fixes
   are folded into the commit that introduced the code. Once pushed (a PR
   exists / history is shared), fixes are new commits — never a rewrite.
6. **Verify empirically.** Every claim — a commit is correct, a test passes,
   the branch is/isn't pushed — is backed by a command that actually ran.

**Rule 5 is read, not assumed.** Before any rewrite, run
`git branch -r --contains <commit>`; non-empty output means that commit is
shared and the branch is in append-only mode. `fold-into-commit.sh` enforces
this too, but check first — it decides which phase applies.

## Phase 1 — Choreograph

Goal: the branch tells its story in order. All rewrites in this phase are
pre-push only (verify per rule 5).

1. Establish the range: `base` = merge-base with the default branch,
   `head` = branch tip. Read the history: `git log --reverse --stat base..head`.
2. Reorder/squash into dependency order; spec (if one exists) becomes commit
   #1. Drop scaffolding and throwaway files.
3. Fold misplaced content into its owning commit (below), **then** rewrite
   any commit body that doesn't carry what/why/how — in that order, so a
   reword can absorb the *why* of a commit a fold just consumed.
4. For edits to a single commit's *content*, stage the edit and use the
   guarded script rather than hand-rolling rebases (`<skill-dir>` is the
   directory containing this SKILL.md — resolve it to an absolute path; the
   target repo is usually not the repo the skill lives in):

   ```
   git add <files>
   <skill-dir>/scripts/fold-into-commit.sh <owning-commit> <files>
   ```

   It records a backup branch, refuses pushed commits, and verifies the
   cumulative diff contains only the intended files.

   - **Fix already sitting on the tip as its own commit** (the most common
     defect): `git reset --soft HEAD~1` to turn it back into staged edits,
     then fold as above. Before discarding it, salvage its message — its
     *why* belongs in the owning commit's body.
   - **Tree-neutral mid-history edits** — e.g. inserting a stub into a test
     commit that a later commit already compensates for — are *structural
     surgery*, not a fold: the script's contract is that the staged diff
     propagates to HEAD, which is exactly wrong here. Rebase manually with
     an `edit` stop, same discipline: backup branch first, and afterwards
     verify `git diff <backup>..HEAD` is **empty** (the final tree must not
     change). The same discipline applies to reordering and splitting.
5. Verify the result: every commit builds/tests where the repo makes that
   feasible — **except designated red commits, which must fail, and fail
   behaviorally** (an assertion, not an import/undefined-symbol error).
   `git range-diff` (or the backup diff) shows only what you intended.

## Phase 2 — Review-and-fold loop (pre-push only)

Defects you already recognized (anything in the red-flags list) are fixed in
Phase 1; this audit is the backstop that catches what choreography missed. A
clean first audit after a defect-heavy Phase 1 is a good sign, not a wasted
dispatch.

1. Build the package:
   `<skill-dir>/scripts/commit-review-package.sh <base> <head>`
   — prints the package file path.
2. Dispatch the `commit-auditor` agent with **only** the range and the
   package path (never the conversation). It returns findings ranked
   most-severe first, tagged CONFIRMED / PLAUSIBLE.
3. Triage with the user (or by severity when running autonomously). For each
   accepted fix: make the edit, `git add` it, then
   `fold-into-commit.sh <owning-commit> <files>` — the owning commit is the
   one that introduced the defective code, not the tip. If the fold makes
   the owning commit's body stale or incomplete, reword it in the same pass.
4. Re-audit the touched commits (a fresh package for just that part of the
   range is fine). Loop until the audit is clean or remaining findings are
   explicitly deferred.

If the branch is already pushed, skip folding entirely: fixes land as new
commits with their own what/why/how bodies.

## Phase 3 — Final whole-branch review

Compose the existing reviewers rather than re-reviewing yourself:

- Run the `pr-deep-review` skill over the branch for the whole-PR dimension.
- Its flow already includes the `test-quality-reviewer` agent; if it was
  skipped, dispatch that agent directly on the branch's source+test files.

Findings here follow the same rule 5 boundary: fold if unpushed, append if
pushed.

## Phase 4 — PR

1. Follow the **target repo's own PR instructions** (`CLAUDE.md`,
   `CONTRIBUTING`, PR template) for title and body format.
2. Regardless of template, **append a commit-by-commit narrative**: one line
   per commit — what it does and why it sits at that point in the order.
3. From the moment the branch is pushed, the branch is append-only (rule 5).

## Red flags — stop and re-check

- About to `rebase`/`amend` without having run the pushed check → rule 5.
- A fix about to be committed on the tip of an unpushed branch → fold it.
- A commit message written from memory of the diff → rules 2 and 6: verify
  claims against the code before committing them.
- A red commit that fails with "not defined / not implemented" → rule 3:
  move the stub into the test's commit.
- Hand-rolling a fold with raw rebase commands → use `fold-into-commit.sh`.
