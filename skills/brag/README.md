# /brag skill

Maintains a personal brag document by gathering evidence from GitHub, Linear,
Slack, Notion, Granola, and Google Calendar, running an interactive interview,
and merging approved entries into a single persistent doc.

## Prerequisites

- `gh` CLI — authenticated (`gh auth login`)
- `gcalcli` — installed and authenticated (`gcalcli init`)
- Slack MCP — configured in Claude Code
- Linear MCP (`linear-mcp`) — configured in Claude Code with `LINEAR_ACCESS_TOKEN`
- Notion MCP — configured in Claude Code (remote OAuth via `claude mcp login notion`)

## Installation

### 1. Symlink the agent

```bash
ln -sf ~/Code/ai-tools/agents/brag-documenter.md ~/.claude/agents/brag-documenter.md
```

### 2. Symlink the context file

```bash
mkdir -p ~/.claude/brag
ln -sf ~/Code/ai-tools/config/brag/context.md ~/.claude/brag/context.md
```

### 3. Fill in your context

Edit `~/Code/ai-tools/config/brag/context.md` with your company's actual values and your role's expectations.

### 4. Symlink this skill

```bash
ln -sf ~/Code/ai-tools/skills/brag ~/.claude/skills/brag
```

(Adjust the target path if your Claude Code skills directory differs.)

### 5. Create brag doc directory

```bash
mkdir -p ~/Documents/brag
```

## Usage

```
/brag
/brag "This week I focused on the auth migration"
/brag --since 2026-06-01
/brag --since 2026-06-01 "context here"
```

## Last-run tracking

Each run records the last date it covered in `~/.claude/brag/last_run.json`.
The next `/brag` (without `--since`) picks up the day after that through
yesterday, so you never re-gather or miss days between runs. Passing `--since`
explicitly always overrides this and does not touch the state file's read
path (it still gets overwritten at the end of the run). Delete
`~/.claude/brag/last_run.json` to reset to the default 7-day lookback.

## Customization

- **Brag doc path:** Tell the agent a different path in the `/brag` invocation, or edit the default in `skills/brag/SKILL.md`.
- **Values/roles:** Edit `config/brag/context.md` — changes take effect on the next run.
