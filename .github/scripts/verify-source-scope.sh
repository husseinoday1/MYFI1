#!/usr/bin/env bash
#
# One source-scope check, shared by every gated workflow.
#
# The check itself is unchanged and deliberately still a conscious decision: a file may
# only differ from the accepted baseline if it is written down in an allowlist that is
# reviewed like code. What changed is what happens when it fails.
#
# This gate had failed three times for one reason — someone added a source file and did
# not add the matching line to the allowlist — and each time the build printed a raw
# `diff -u` of two temp files and stopped. That output says a mismatch exists without
# saying what to do about it, so the rule survived only in whoever remembered it. A rule
# that depends on memory fails on the day memory fails.
#
# So a mismatch now names the missing lines and prints them ready to paste. Still a
# refusal, still requiring a human to decide the file belongs there; just no longer
# requiring them to work out what the gate wanted.
#
# Usage:
#   verify-source-scope.sh <base-commit> <allowlist-file> [pathspec...]
#
# With no pathspec, every changed file is compared. With one, only paths under it —
# which is how the D1 build limits itself to shipped source and ignores docs and tests.

set -euo pipefail

BASE="${1:?base commit required}"
ALLOWED="${2:?allowlist file required}"
shift 2

if ! git merge-base --is-ancestor "$BASE" HEAD; then
  echo "[FAIL] HEAD is not built on top of the expected baseline $BASE"
  echo "       This branch has been rebased or started from somewhere else."
  exit 1
fi

if [ ! -f "$ALLOWED" ]; then
  echo "[FAIL] allowlist file not found: $ALLOWED"
  exit 1
fi

# The list is authored on Windows and compared on a Linux runner, so a trailing CR
# would silently mismatch every single entry.
# grep exits 1 on a comments-only file, and pipefail would kill the script right
# there — before the check below could say why. Fail with the reason, not in silence.
sed -e 's/\r$//' "$ALLOWED" | { grep -vE '^[[:space:]]*(#|$)' || true; } | sort -u > /tmp/expected.txt

if [ ! -s /tmp/expected.txt ]; then
  echo "[FAIL] allowlist $ALLOWED has no entries"
  exit 1
fi

if [ "$#" -gt 0 ]; then
  git diff --name-only "$BASE"..HEAD -- "$@" | sed -e 's/\r$//' | sort -u > /tmp/actual.txt
else
  git diff --name-only "$BASE"..HEAD | sed -e 's/\r$//' | sort -u > /tmp/actual.txt
fi

# Changed but not listed: the case that keeps happening.
comm -13 /tmp/expected.txt /tmp/actual.txt > /tmp/missing.txt
# Listed but no longer changed: a stale entry, which hides a file that quietly stopped
# being touched and would let it change again unnoticed.
comm -23 /tmp/expected.txt /tmp/actual.txt > /tmp/stale.txt

if [ ! -s /tmp/missing.txt ] && [ ! -s /tmp/stale.txt ]; then
  echo "[PASS] baseline ancestry and repo-tracked source scope verified against $ALLOWED"
  exit 0
fi

echo "[FAIL] source scope does not match $ALLOWED"
echo

if [ -s /tmp/missing.txt ]; then
  echo "  These files changed but are not in the allowlist."
  echo "  Add them to $ALLOWED in the same commit that first changes them,"
  echo "  then push again. Copy the block below as-is:"
  echo
  echo "  ----- copy from here -----"
  cat /tmp/missing.txt
  echo "  ----- to here -----"
  echo
fi

if [ -s /tmp/stale.txt ]; then
  echo "  These are listed in the allowlist but no longer differ from the baseline."
  echo "  Remove them, or the list stops describing the real scope:"
  echo
  sed -e 's/^/    /' /tmp/stale.txt
  echo
fi

echo "  Full comparison (expected = allowlist, actual = real diff):"
diff -u /tmp/expected.txt /tmp/actual.txt || true
exit 1
