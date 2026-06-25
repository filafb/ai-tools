#!/usr/bin/env node
// Runs as a Claude Code UserPromptSubmit hook.
// Outputs a plain-text warning if KB pages are stale.
// Must exit 0 — never block the session.

import { checkStaleness, shouldNotify, markNotified, getHeadCommit, isOnDefaultBranch } from '../staleness.js';

const cwd = process.cwd();

try {
  if (!isOnDefaultBranch(cwd)) process.exit(0); // WIP branch — skip

  if (!shouldNotify(cwd)) process.exit(0); // Already notified at this HEAD

  const stale = checkStaleness(cwd);

  if (stale.length > 0) {
    const preview = stale
      .slice(0, 3)
      .map(p => p.title)
      .join(', ');
    const more = stale.length > 3 ? ` (+${stale.length - 3} more)` : '';
    console.log(
      `⚠️  KB: ${stale.length} page(s) may be stale — ${preview}${more}. Run /kb:status to review.`,
    );
  }

  const head = getHeadCommit(cwd);
  if (head) markNotified(cwd, head);
} catch {
  // Never let the hook crash the session
  process.exit(0);
}
