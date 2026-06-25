# Agents

Custom Claude Code subagents. Each agent is a single `.md` file with a YAML
frontmatter and a system prompt.

## Available agents

| Agent | Description |
|-------|-------------|
| `test-quality-reviewer` | Evaluates test quality across 8 dimensions. Language-agnostic. |
| `kb-ingest` | Writes approved knowledge chunks to ~/.claude/wiki/, updates index.md and log.md | sonnet |
| `kb-scope` | Resolves category ambiguity for a KB chunk; asks user to confirm or redirect | haiku |

## Installation

Agents must be symlinked into `~/.claude/agents/` to be available globally.
Unlike skills (which are directories), each agent is a single `.md` file.

```bash
ln -s /Users/<you>/Code/ai-tools/agents/test-quality-reviewer.md \
      ~/.claude/agents/test-quality-reviewer.md
```

Verify it is registered:

```bash
ls -la ~/.claude/agents/test-quality-reviewer.md
```

Claude Code picks up new agents automatically — no restart needed.

## Model and effort

Agents declare a `model` tier alias in their frontmatter (e.g. `model: sonnet`).
Tier aliases (`sonnet`, `opus`, `haiku`) always resolve to the latest model
in that tier — you never need to update for version bumps. Only update the
`model` field if Anthropic retires the entire tier, which has not happened.

The `effort` level can be overridden by the caller (the Agent tool call)
when a specific invocation needs more or less power than the default.

## Adding an agent

1. Create `agents/<agent-name>.md` with frontmatter and system prompt
2. Symlink it:
   ```bash
   ln -s /Users/<you>/Code/ai-tools/agents/<agent-name>.md \
         ~/.claude/agents/<agent-name>.md
   ```
