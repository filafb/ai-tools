#!/usr/bin/env bash
# commit-review-package.sh <base> <head> [out-file]
#
# Emits, to one file, everything an auditor needs to review base..head in
# one shot: the commit list, then for each commit its full message, diffstat,
# and diff with -U10 context. Prints the package file path on stdout.
set -euo pipefail

usage() { echo "usage: commit-review-package.sh <base> <head> [out-file]" >&2; exit 2; }

[ $# -ge 2 ] || usage
base="$1"
head="$2"
out="${3:-$(mktemp "${TMPDIR:-/tmp}/commit-review-package.XXXXXX")}"

git rev-parse --verify --quiet "$base^{commit}" >/dev/null || { echo "error: invalid base ref: $base" >&2; exit 2; }
git rev-parse --verify --quiet "$head^{commit}" >/dev/null || { echo "error: invalid head ref: $head" >&2; exit 2; }

{
  echo "# Commit review package: $base..$head"
  echo
  echo "## Commit list (oldest first)"
  echo
  git log --reverse --format='- %h %s' "$base..$head"
  echo

  git rev-list --reverse "$base..$head" | while read -r sha; do
    echo "=================================================================="
    echo "## Commit $(git log -1 --format='%h %s' "$sha")"
    echo
    echo "### Message"
    echo
    git log -1 --format='%B' "$sha"
    echo "### Stat"
    echo
    git show --stat --format= "$sha"
    echo
    echo "### Diff (-U10)"
    echo
    git show -U10 --format= "$sha"
    echo
  done
} > "$out"

echo "$out"
