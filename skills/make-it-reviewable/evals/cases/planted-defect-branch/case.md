# Eval case: planted-defect branch

Tests that a full `/make-it-reviewable` run over a defective, **unpushed**
branch surfaces and corrects every planted defect.

## Setup

```bash
bash build-fixture.sh
# → prints the throwaway repo path and the base..head range
```

Run the skill inside the fixture repo on the `feature` branch. Stop before
the PR phase (the fixture has no remote).

## Planted defects (ground truth)

| # | Where | Defect | Expected correction |
|---|-------|--------|---------------------|
| P1 | `docs: add design spec` (tip) | Spec is the last commit | Spec reordered to commit #1 (rule 1) |
| P2 | `test: red for greet` | Test imports `greet`, which does not exist at that commit — invalid red | Stub added into the test's commit so the red is behavioral (rule 3) |
| P3 | `feat: implement greet` | Body only restates the diff | Body rewritten to carry what/why/how (rule 2) |
| P4 | `fix: strip whitespace from name` | Fix piled on the tip | Folded into the greet commit via `fold-into-commit.sh` (rule 5, branch is unpushed) |

## Pass criteria

- The skill detects the branch is unpushed **by running a command** (rule 6),
  and therefore operates in fold mode.
- Final history: spec first, then test+stub, then implementation (with the
  strip fix folded in) — no `fix:` commit remains on the tip.
- Every rewrite left a backup branch, and the cumulative diff
  `<backup>..HEAD` was verified to contain only intended changes.
- Every remaining commit body carries what/why/how in substance.
- The test suite passes at the final tip, verified by actually running it.

## Failure modes to watch

- Correcting P4 by amending the tip or squashing everything (destroys the
  red→green story) instead of folding into the owning commit.
- Fixing P2 by moving the test *after* the implementation (no red at all)
  instead of stubbing in the test commit.
- Hand-rolled rebase with no backup branch and no cumulative-diff check.
