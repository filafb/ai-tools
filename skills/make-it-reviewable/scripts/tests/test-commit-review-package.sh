#!/usr/bin/env bash
# Tests for commit-review-package.sh against throwaway git repos.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$SCRIPT_DIR/../commit-review-package.sh"

PASS=0
FAIL=0

assert() { # assert <description> <command...>
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $desc" >&2
  fi
}

make_repo() {
  local dir
  dir="$(mktemp -d)"
  git -C "$dir" init -q -b main
  git -C "$dir" config user.email test@example.com
  git -C "$dir" config user.name Test
  echo "$dir"
}

commit_file() { # commit_file <repo> <file> <content> <subject>
  printf '%s\n' "$3" > "$1/$2"
  git -C "$1" add "$2"
  git -C "$1" commit -q -m "$4"
}

# --- fixture: base commit + two commits under review -------------------------
repo="$(make_repo)"
commit_file "$repo" base.txt "base" "chore: base commit"
base_sha="$(git -C "$repo" rev-parse HEAD)"
# a file long enough to show -U10 context: 30 numbered lines
seq 1 30 | sed 's/^/line-/' > "$repo/long.txt"
git -C "$repo" add long.txt
git -C "$repo" commit -q -m "feat: add long file"
sed -i.bak 's/^line-15$/line-15-changed/' "$repo/long.txt" && rm "$repo/long.txt.bak"
git -C "$repo" add long.txt
git -C "$repo" commit -q -m "fix: tweak middle line"
head_sha="$(git -C "$repo" rev-parse HEAD)"

out="$(cd "$repo" && "$SUT" "$base_sha" "$head_sha")"
status=$?

assert "exits zero on a valid range" test "$status" -eq 0
assert "prints the package file path" test -n "$out"
assert "package file exists" test -f "$out"
assert "package lists first commit subject" grep -q "feat: add long file" "$out"
assert "package lists second commit subject" grep -q "fix: tweak middle line" "$out"
assert "package contains per-commit diff content" grep -q "line-15-changed" "$out"
assert "diff carries -U10 context (a line 9 away is present)" grep -q "line-6" "$out"
assert "package contains a diffstat" grep -Eq "long.txt \|" "$out"
assert "base commit itself is excluded" sh -c "! grep -q 'chore: base commit' '$out'"

# --- invalid refs ------------------------------------------------------------
(cd "$repo" && "$SUT" not-a-ref "$head_sha" >/dev/null 2>&1)
assert "exits non-zero on an invalid base ref" test $? -ne 0

(cd "$repo" && "$SUT" >/dev/null 2>&1)
assert "exits non-zero when arguments are missing" test $? -ne 0

echo "commit-review-package: $PASS passed, $FAIL failed"
exit "$((FAIL > 0 ? 1 : 0))"
