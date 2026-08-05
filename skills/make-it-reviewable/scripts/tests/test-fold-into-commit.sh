#!/usr/bin/env bash
# Tests for fold-into-commit.sh against throwaway git repos.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="$SCRIPT_DIR/../fold-into-commit.sh"

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

three_commit_repo() { # base -> c1(a.txt) -> c2(b.txt) -> c3(c.txt)
  local dir
  dir="$(make_repo)"
  commit_file "$dir" a.txt "alpha" "feat: add a"
  commit_file "$dir" b.txt "beta" "feat: add b"
  commit_file "$dir" c.txt "gamma" "feat: add c"
  echo "$dir"
}

# --- happy path: fold a staged fix into the commit that owns the file --------
repo="$(three_commit_repo)"
c1="$(git -C "$repo" rev-parse HEAD~2)"
printf 'alpha\nalpha-fix\n' > "$repo/a.txt"
git -C "$repo" add a.txt
(cd "$repo" && "$SUT" "$c1" a.txt >/dev/null 2>&1)
assert "exits zero on a clean fold" test $? -eq 0
assert "history still has three commits" \
  test "$(git -C "$repo" rev-list --count HEAD)" -eq 3
assert "rewritten owning commit contains the fix" \
  sh -c "git -C '$repo' show 'HEAD~2' -- a.txt | grep -q alpha-fix"
assert "owning commit subject is preserved" \
  sh -c "git -C '$repo' log -1 --format=%s 'HEAD~2' | grep -q 'feat: add a'"
assert "later commits are replayed on top" \
  sh -c "git -C '$repo' log -1 --format=%s HEAD | grep -q 'feat: add c'"
assert "working tree is clean afterwards" \
  sh -c "test -z \"\$(git -C '$repo' status --porcelain)\""
assert "a backup branch was recorded" \
  sh -c "git -C '$repo' branch --list 'backup/*' | grep -q backup"
backup="$(git -C "$repo" branch --list 'backup/*' --format='%(refname:short)' | head -1)"
assert "cumulative diff vs backup touches only the intended file" \
  sh -c "test \"\$(git -C '$repo' diff --name-only '$backup'..HEAD)\" = a.txt"

# --- refuses when nothing is staged ------------------------------------------
repo="$(three_commit_repo)"
c1="$(git -C "$repo" rev-parse HEAD~2)"
(cd "$repo" && "$SUT" "$c1" a.txt >/dev/null 2>&1)
assert "exits non-zero when nothing is staged" test $? -ne 0

# --- refuses when staged changes touch files outside the given list ----------
repo="$(three_commit_repo)"
c1="$(git -C "$repo" rev-parse HEAD~2)"
printf 'alpha\nfix\n' > "$repo/a.txt"
printf 'beta\nsneaky\n' > "$repo/b.txt"
git -C "$repo" add a.txt b.txt
(cd "$repo" && "$SUT" "$c1" a.txt >/dev/null 2>&1)
assert "exits non-zero when staged files exceed the declared list" test $? -ne 0

# --- refuses to rewrite pushed history ----------------------------------------
repo="$(three_commit_repo)"
remote="$(mktemp -d)"
git init -q --bare "$remote"
git -C "$repo" remote add origin "$remote"
git -C "$repo" push -q -u origin main
c1="$(git -C "$repo" rev-parse HEAD~2)"
head_before="$(git -C "$repo" rev-parse HEAD)"
printf 'alpha\nfix\n' > "$repo/a.txt"
git -C "$repo" add a.txt
(cd "$repo" && "$SUT" "$c1" a.txt >/dev/null 2>&1)
assert "exits non-zero when the target commit is pushed" test $? -ne 0
assert "pushed history is untouched" \
  test "$(git -C "$repo" rev-parse HEAD)" = "$head_before"

# --- restores from backup when the replay conflicts ---------------------------
repo="$(make_repo)"
commit_file "$repo" a.txt "v1" "feat: add a"
c1="$(git -C "$repo" rev-parse HEAD)"
commit_file "$repo" a.txt "v2" "feat: rewrite a"   # later commit rewrites same line
head_before="$(git -C "$repo" rev-parse HEAD)"
printf 'v1-conflicting-fix\n' > "$repo/a.txt"
git -C "$repo" add a.txt
(cd "$repo" && "$SUT" "$c1" a.txt >/dev/null 2>&1)
assert "exits non-zero when the replay conflicts" test $? -ne 0
assert "no rebase is left in progress" \
  sh -c "! test -d '$repo/.git/rebase-merge' && ! test -d '$repo/.git/rebase-apply'"
assert "history is restored to the pre-fold state" \
  test "$(git -C "$repo" rev-parse HEAD)" = "$head_before"

echo "fold-into-commit: $PASS passed, $FAIL failed"
exit "$((FAIL > 0 ? 1 : 0))"
