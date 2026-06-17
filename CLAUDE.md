# ai-tools

Claude Code skills and agents for reuse across projects.

## Repo layout

```
skills/<name>/SKILL.md     # skill instructions (directory per skill)
skills/<name>/evals/       # eval cases for the skill
agents/<name>.md           # subagent definition (single file per agent)
agents/evals/<name>/       # eval cases for the agent
```

## Artifact types

### Skills (`skills/<name>/SKILL.md`)

Skills are instruction sets invoked with `/skill-name` in Claude Code. They
run in the main conversation context — they can spawn agents, call tools,
and interact with the user.

Required files per skill: `SKILL.md`, `README.md`.

Frontmatter schema:
```yaml
---
name: kebab-case-name
description: One sentence shown in the skill picker. Be specific about triggers.
license: MIT
metadata:
  author: <name>
  version: "0.1.0"
---
```

### Agents (`agents/<name>.md`)

Agents are isolated subagents spawned via the `Agent` tool. They receive
only what the caller passes in their prompt — no conversation context bleeds
in. Use agents for tasks that are reusable across multiple skills or SDLC
steps and benefit from isolation.

Frontmatter schema:
```yaml
---
name: kebab-case-name
description: One sentence describing the agent's capability and when to use it.
model: sonnet          # tier alias — never a version ID like claude-sonnet-4-6
tools: Read, Bash      # only the tools the agent actually needs
---
```

## Key conventions

**Model field — always use a tier alias, never a version ID.**
`model: sonnet`, `model: opus`, `model: haiku`. Tier aliases track the
latest model in that tier automatically. Version IDs (e.g. `claude-sonnet-4-6`)
rot when Anthropic ships the next version.

**Agents must be language-agnostic unless the skill explicitly targets one
language.** Use language-neutral terminology in rules; give multi-language
examples where concreteness helps.

**Skills that delegate a bounded subtask to an agent must pass the agent
only the data it needs** — do not forward the whole conversation. The
agent's output should be embeddable verbatim in the skill's output.

**Evals live next to the artifact they test.** See `agents/README.md` for
the fixture format and runner script.

**Do not add features beyond what the current skill/agent requires.** Each
artifact has a single responsibility. If a new capability is needed, create
a new skill or agent.

## Adding a new skill

1. Create `skills/<name>/SKILL.md` following the frontmatter schema above
2. Create `skills/<name>/README.md` with installation instructions and usage
3. Update `README.md` to include the new skill in the structure overview
4. Add at least one eval case under `skills/<name>/evals/cases/`

## Adding a new agent

1. Create `agents/<name>.md` following the frontmatter schema above
2. Update `agents/README.md` to add the agent to the table
3. Update `README.md` to include it in the structure overview
4. Add at least one eval case under `agents/evals/<name>/cases/`
