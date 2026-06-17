# pr-deep-review

A Claude Code skill for deep, structured PR reviews.

## What it produces

1. **Test analysis** — behavioral vs implementation, coverage gaps, concrete missing edge cases
2. **Navigation table** — files in DFS order (entry point → dependencies) with bugs, smells, and regression risks inline at their line numbers
3. **PR summary** — two to four sentences on what the PR does

## Usage

Once installed, invoke from any Claude Code session:

```
/pr-deep-review
/pr-deep-review 37
```

## Installation

Skills must be symlinked into `~/.claude/skills/` to be available globally.

```bash
ln -s /Users/<you>/Code/ai-tools/skills/pr-deep-review ~/.claude/skills/pr-deep-review
```

Verify it is registered:

```bash
ls -la ~/.claude/skills/pr-deep-review
```

Claude Code picks up new skills automatically — no restart needed.

## Repository layout

```
skills/
└── pr-deep-review/
    ├── SKILL.md     # Instructions Claude follows when the skill is invoked
    └── README.md    # This file
```

To add more skills, create a new directory under `skills/` with a `SKILL.md`
and add a symlink following the same pattern.
