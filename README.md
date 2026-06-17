# ai-tools

Personal collection of Claude Code skills and agents.

## Structure

```
skills/                      # Claude Code skills (invoked with /skill-name)
└── pr-deep-review/          # Deep PR review with DFS navigation table

agents/                      # Claude Code custom subagents
└── test-quality-reviewer.md # Test quality evaluation across 8 dimensions
```

## Installation

Clone this repo anywhere on your machine, then symlink the artifacts into
Claude Code's lookup directories. Replace `<repo-root>` with the absolute
path where you cloned it.

### Skills (directories → symlink the directory)

```bash
ln -s <repo-root>/skills/<skill-name> ~/.claude/skills/<skill-name>
```

### Agents (single .md files → symlink the file)

```bash
mkdir -p ~/.claude/agents
ln -s <repo-root>/agents/<agent-name>.md ~/.claude/agents/<agent-name>.md
```

### Quick setup (all artifacts)

```bash
REPO=<repo-root>

ln -s "$REPO/skills/pr-deep-review"                   ~/.claude/skills/pr-deep-review
mkdir -p ~/.claude/agents
ln -s "$REPO/agents/test-quality-reviewer.md"          ~/.claude/agents/test-quality-reviewer.md
```

Claude Code picks up new skills and agents automatically — no restart needed.

## Adding new artifacts

See `skills/pr-deep-review/README.md` and `agents/README.md` for the
conventions each artifact type follows.
