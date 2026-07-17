#!/usr/bin/env bash
# Builds a throwaway repo whose branch has the four history defects listed
# in case.md, for a full make-it-reviewable run. Prints the repo path and
# the base..head range. The branch is intentionally UNPUSHED (no remote),
# so the skill must choose fold mode.
set -euo pipefail

repo="$(mktemp -d "${TMPDIR:-/tmp}/make-it-reviewable-eval.XXXXXX")"
git -C "$repo" init -q -b main
git -C "$repo" config user.email eval@example.com
git -C "$repo" config user.name Eval

echo "# greeter" > "$repo/README.md"
git -C "$repo" add README.md
git -C "$repo" commit -q -m "chore: init"
base="$(git -C "$repo" rev-parse HEAD)"

git -C "$repo" checkout -q -b feature

# defect: test lands before its symbol exists (invalid red) — stub missing
cat > "$repo/test_greet.py" <<'EOF'
from greet import greet

def test_greet():
    assert greet("Ada") == "Hello, Ada!"
EOF
git -C "$repo" add test_greet.py
git -C "$repo" commit -q -m "test: red for greet

What: pins greet()'s contract.
Why: TDD red before the implementation lands.
How: plain assert, executable directly with python3."

# defect: body only restates the diff (missing why/how)
cat > "$repo/greet.py" <<'EOF'
def greet(name):
    return f"Hello, {name}!"
EOF
git -C "$repo" add greet.py
git -C "$repo" commit -q -m "feat: implement greet

Adds a greet function that returns a greeting for the given name."

# defect: fix piled on the tip that belongs in the greet commit
cat > "$repo/greet.py" <<'EOF'
def greet(name):
    return f"Hello, {name.strip()}!"
EOF
git -C "$repo" add greet.py
git -C "$repo" commit -q -m "fix: strip whitespace from name

What: greet() now strips the incoming name.
Why: callers pass padded names from form input.
How: str.strip() before interpolation."

# defect: the spec exists but is the LAST commit, not the first
cat > "$repo/SPEC.md" <<'EOF'
# greet — design

greet(name) returns "Hello, <name>!" with surrounding whitespace stripped.
EOF
git -C "$repo" add SPEC.md
git -C "$repo" commit -q -m "docs: add design spec

What: the design doc for greet.
Why: reviewers need the intent before the code.
How: single markdown file."

head="$(git -C "$repo" rev-parse HEAD)"
echo "repo: $repo"
echo "range: $base..$head"
