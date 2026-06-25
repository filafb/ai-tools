import { execSync } from 'node:child_process';
import { getCodeDerivedPages, getMetaValue, setMetaValue } from './db.js';
import type { StalePageRecord } from './types.js';

function exec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export function getCurrentBranch(repoPath: string): string | null {
  return exec('git branch --show-current', repoPath);
}

export function getDefaultBranch(repoPath: string): string | null {
  const ref = exec('git symbolic-ref refs/remotes/origin/HEAD', repoPath);
  if (ref) return ref.replace('refs/remotes/origin/', '');
  // Fallback: check for main or master
  const branches = exec('git branch', repoPath) ?? '';
  if (branches.includes('main')) return 'main';
  if (branches.includes('master')) return 'master';
  return null;
}

export function isOnDefaultBranch(repoPath: string): boolean {
  const current = getCurrentBranch(repoPath);
  const defaultBranch = getDefaultBranch(repoPath);
  if (!current || !defaultBranch) return false;
  return current === defaultBranch;
}

export function getHeadCommit(repoPath: string): string | null {
  return exec('git rev-parse HEAD', repoPath);
}

export function checkStaleness(repoPath: string): StalePageRecord[] {
  if (!isOnDefaultBranch(repoPath)) return [];

  const pages = getCodeDerivedPages().filter(p => p.repo === repoPath);
  const stale: StalePageRecord[] = [];

  for (const page of pages) {
    const fileArgs = page.source_files.map(f => `"${f}"`).join(' ');
    const diff = exec(
      `git diff "${page.source_commit}"..HEAD -- ${fileArgs}`,
      repoPath,
    );
    if (diff && diff.length > 0) {
      stale.push(page);
    }
  }

  return stale;
}

export function shouldNotify(repoPath: string): boolean {
  const head = getHeadCommit(repoPath);
  if (!head) return false;
  const lastNotified = getMetaValue(`staleness_notified:${repoPath}`);
  return lastNotified !== head;
}

export function markNotified(repoPath: string, commit: string): void {
  setMetaValue(`staleness_notified:${repoPath}`, commit);
}
