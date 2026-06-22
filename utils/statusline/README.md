# Claude Code Statusline

A two-line status bar for Claude Code showing model, context, cost, rate limits, and git state.

```
🤖 Claude Sonnet 4.6 | 💪 high | 🧠 12% | 💰 $0.04 | ⏱️ 5h ████░░░░░░ 42% resets 2:00PM | 7d ██░░░░░░░░ 18% resets Mon
📁 ai-tools | 🌳 main | 🌿 feat/foo +3 ~1
```

| Field | Description |
|-------|-------------|
| 🤖 Model | Active Claude model |
| 💪 Effort | Reasoning effort level (when set) |
| 🧠 Context | Context window usage % |
| 💰 Cost | Cumulative session cost in USD |
| ⏱️ 5h / 7d | Rate limit bars with % and reset time |
| 📁 Path | Repo path relative to `~/Code` |
| 🌳 Worktree | Active git worktree |
| 🌿 Branch | Branch with staged (+) and modified (~) file counts |

Rate limit bar color: green (<70%), yellow (70–89%), red (≥90%).

## Prerequisites

- [`jq`](https://jqlang.github.io/jq/) — `brew install jq`
- `git`

## Install

**1. Symlink the script** (changes to this repo are immediately reflected):

```sh
ln -sf "$(pwd)/utils/statusline/statusline-command.sh" ~/.claude/statusline-command.sh
```

Run this from the repo root. If you prefer a standalone copy instead:

```sh
cp utils/statusline/statusline-command.sh ~/.claude/statusline-command.sh
chmod +x ~/.claude/statusline-command.sh
```

**2. Add to `~/.claude/settings.json`:**

```json
{
  "statusLine": {
    "type": "command",
    "command": "sh ~/.claude/statusline-command.sh",
    "padding": 0
  }
}
```

For a project-level statusline, add the same block to `.claude/settings.json` in the project root instead.

**3. Restart Claude Code** — the statusline appears automatically.

## Credits

Based on [danielmackay/claude-code-statusline](https://github.com/danielmackay/claude-code-statusline).
