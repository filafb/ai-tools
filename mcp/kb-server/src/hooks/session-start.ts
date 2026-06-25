#!/usr/bin/env node
// Runs as a Claude Code UserPromptSubmit hook.
// Outputs a plain-text warning if KB pages are stale.
// Must exit 0 — never block the session.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { checkStaleness, getHeadCommit, isOnDefaultBranch } from '../staleness.js';

function wikiRoot(): string {
  return process.env['WIKI_ROOT_OVERRIDE'] || join(homedir(), '.claude', 'wiki');
}

// One sentinel file per repo — contains the last HEAD we checked.
// File read is cheaper than opening SQLite on every prompt.
function sentinelPath(repoPath: string): string {
  const hash = createHash('sha1').update(repoPath).digest('hex').slice(0, 8);
  return join(wikiRoot(), `.notified-${hash}`);
}

const cwd = process.cwd();

try {
  // Fast path: one git command + one file read before doing anything heavier.
  const head = getHeadCommit(cwd);
  if (!head) process.exit(0);

  const sentinel = sentinelPath(cwd);
  if (existsSync(sentinel) && readFileSync(sentinel, 'utf8').trim() === head) {
    process.exit(0); // Already checked at this HEAD — nothing to do.
  }

  // HEAD moved. Check branch before running the full staleness scan.
  if (!isOnDefaultBranch(cwd)) {
    // Write sentinel so we don't repeat the branch check on every prompt
    // until HEAD moves again.
    mkdirSync(wikiRoot(), { recursive: true });
    writeFileSync(sentinel, head);
    process.exit(0);
  }

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

  mkdirSync(wikiRoot(), { recursive: true });
  writeFileSync(sentinel, head);
} catch {
  // Never let the hook crash the session.
  process.exit(0);
}
