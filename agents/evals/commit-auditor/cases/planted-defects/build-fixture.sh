#!/usr/bin/env bash
# Builds a throwaway repo whose branch contains the planted per-commit
# defects listed in case.md. Prints the repo path and the base..head range.
set -euo pipefail

repo="$(mktemp -d "${TMPDIR:-/tmp}/commit-auditor-eval.XXXXXX")"
git -C "$repo" init -q -b main
git -C "$repo" config user.email eval@example.com
git -C "$repo" config user.name Eval

# base
echo "# text utils" > "$repo/README.md"
git -C "$repo" add README.md
git -C "$repo" commit -q -m "chore: init"
base="$(git -C "$repo" rev-parse HEAD)"

# D1 — message claims behavior the code does not have (lowercasing)
cat > "$repo/textutils.py" <<'EOF'
import re

def slugify(text):
    return re.sub(r"\s+", "-", text.strip())
EOF
git -C "$repo" add textutils.py
git -C "$repo" commit -q -m "feat: add slugify

What: slugify(text) for URL-safe identifiers.
Why: page titles become URL fragments in several call sites.
How: lowercases the input and collapses whitespace runs to single dashes."

# D2 — invalid red: test references a symbol that does not exist yet
cat > "$repo/test_textutils.py" <<'EOF'
from textutils import slugify, trim_words

def test_trim_words():
    assert trim_words("a b c d", 2) == "a b"

def test_slugify():
    assert slugify("  Hello  World ") == "hello-world"
EOF
git -C "$repo" add test_textutils.py
git -C "$repo" commit -q -m "test: red for trim_words

What: behavioral tests for trim_words and slugify.
Why: pin the contract before implementing trim_words (TDD red).
How: plain asserts, executable directly with python3."

# D3 — body only restates the diff (no why, no how)
cat >> "$repo/textutils.py" <<'EOF'

def trim_words(text, n):
    return " ".join(text.split()[:n])
EOF
git -C "$repo" add textutils.py
git -C "$repo" commit -q -m "feat: implement trim_words

Adds a trim_words function that splits the text and joins the first n words."

# D4 — fix piled on the tip that belongs in the slugify commit
cat > "$repo/textutils.py" <<'EOF'
import re

def slugify(text):
    return re.sub(r"\s+", "-", text.strip().lower())

def trim_words(text, n):
    return " ".join(text.split()[:n])
EOF
git -C "$repo" add textutils.py
git -C "$repo" commit -q -m "fix: slugify should lowercase

What: adds .lower() to slugify.
Why: the slugify commit claimed lowercasing but never did it.
How: chained onto the existing strip()."

head="$(git -C "$repo" rev-parse HEAD)"
echo "repo: $repo"
echo "range: $base..$head"
