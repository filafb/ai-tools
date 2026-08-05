#!/usr/bin/env bash
# fold-into-commit.sh <commit> <file>...
#
# Folds the currently staged edits into <commit> — the commit that owns the
# code — instead of piling a fix onto the tip. The rewrite is guarded:
#
#   1. refuses if <commit> is reachable from any remote branch (pushed
#      history is append-only; see make-it-reviewable rule 5)
#   2. refuses unless the staged edits touch exactly the declared files
#   3. records a backup branch before touching anything
#   4. replays the rest of the branch, then verifies the cumulative diff
#      backup..HEAD contains only the declared files
#   5. on any failure, restores HEAD from the backup and re-stages the fix
#
# The backup branch is kept on success so the caller can inspect or undo.
set -euo pipefail

usage() { echo "usage: fold-into-commit.sh <commit> <file>..." >&2; exit 2; }
die() { echo "error: $*" >&2; exit 1; }

[ $# -ge 2 ] || usage
commit="$1"; shift
declared=("$@")

git rev-parse --verify --quiet "$commit^{commit}" >/dev/null || die "invalid commit: $commit"
commit="$(git rev-parse "$commit^{commit}")"

[ -z "$(git branch -r --contains "$commit" 2>/dev/null)" ] \
  || die "$commit is reachable from a remote branch; pushed history is append-only (add a new commit instead)"

git merge-base --is-ancestor "$commit" HEAD || die "$commit is not an ancestor of HEAD"

git diff --cached --quiet && die "nothing is staged; stage the fix first (git add <files>)"
git diff --quiet || die "unstaged changes present; stash or stage them before folding"

while IFS= read -r staged_file; do
  found=no
  for f in "${declared[@]}"; do
    [ "$staged_file" = "$f" ] && found=yes && break
  done
  [ "$found" = yes ] || die "staged file '$staged_file' is not in the declared file list"
done < <(git diff --cached --name-only)

backup="backup/fold-$(date +%Y%m%d-%H%M%S)-$$"
git branch "$backup" HEAD

restore() {
  git rebase --abort >/dev/null 2>&1 || true
  git reset -q --hard "$backup"
  # put the fix back in the index so nothing is lost
  git cherry-pick -n "$fixup_sha" >/dev/null 2>&1 || true
}

git commit -q --fixup="$commit"
fixup_sha="$(git rev-parse HEAD)"

if [ -n "$(git rev-parse --verify --quiet "$commit^" || true)" ]; then
  onto=("$commit^")
else
  onto=(--root)
fi

if ! GIT_SEQUENCE_EDITOR=: git rebase -q -i --autosquash "${onto[@]}" >/dev/null 2>&1; then
  restore
  die "replay conflicted; restored from $backup (the fix is back in the index)"
fi

unexpected="$(git diff --name-only "$backup"..HEAD | grep -vxF -f <(printf '%s\n' "${declared[@]}") || true)"
if [ -n "$unexpected" ]; then
  restore
  die "cumulative diff touched undeclared files ($unexpected); restored from $backup"
fi

if [ "$(git rev-list --count HEAD)" -ne "$(git rev-list --count "$backup")" ]; then
  restore
  die "commit count changed after replay; restored from $backup"
fi

echo "folded staged edits into $(git log -1 --format='%h %s' "$(git rev-list "$backup"..HEAD | tail -1)")"
echo "backup kept at $backup; verify with: git diff $backup..HEAD"
