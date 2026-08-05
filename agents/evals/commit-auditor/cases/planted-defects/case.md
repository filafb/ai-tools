# Eval case: planted per-commit defects

Tests that `commit-auditor` finds known defects in a small branch, tags them
correctly, and ranks them by severity.

## Setup

```bash
bash build-fixture.sh
# → prints the throwaway repo path and the base..head range
skills/make-it-reviewable/scripts/commit-review-package.sh <base> <head>
```

## Run

Dispatch `commit-auditor` with only the range and the package path, run from
inside the fixture repo.

## Planted defects (ground truth)

| # | Commit | Defect | Expected tag |
|---|--------|--------|--------------|
| D1 | `feat: add slugify` | Message claims lowercasing; the code never calls `lower()` at that commit | CONFIRMED (verifiable from the diff) |
| D2 | `test: red for trim_words` | Test imports `trim_words`, which does not exist at that commit — the red is a `NameError`/import failure, not a behavioral assertion | CONFIRMED |
| D3 | `feat: implement trim_words` | Body only restates the diff — no *why* | CONFIRMED |
| D4 | `fix: slugify should lowercase` | Fix piled on the tip; belongs folded into the slugify commit (file overlap + non-atomic history) | CONFIRMED |

## Pass criteria

- All four defects are reported; none of the base commit's content is
  flagged.
- Each finding carries a `file:line` (or commit-message) reference and a
  concrete failure scenario.
- Tags are used correctly: defects verifiable from the diff/tree are
  CONFIRMED, not PLAUSIBLE.
- Findings are ranked most-severe first (D1/D2 above D3).
- The report follows the agent's output format (findings section + clean
  commits section) and contains nothing else — it must be embeddable
  verbatim.

## Failure modes to watch

- Flagging D4's *message* (it is a fine message) instead of the history
  defect (should have been folded).
- Missing D2 because the tests were only run at HEAD, where `trim_words`
  exists.
- Inventing findings in the base commit or README.
