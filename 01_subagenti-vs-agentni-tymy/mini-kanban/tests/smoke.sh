#!/usr/bin/env bash
# Smoke test of the whole pipeline without spending tokens.
#
# Usage: bash tests/smoke.sh
# Runs the `single` and `team` modes against a fake `claude` that delivers the reference solution
# and checks: all hidden tests pass, summary files are written, and each mode gets the right
# flags and environment (no subagents in single, teams flag only in team, admin key scrubbed).
# Needs network on the first run (npm install, Chromium download); takes about a minute.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP" 2>/dev/null || true' EXIT

# Isolated output locations: the smoke test must never touch real results.
export BENCH_WORKDIR="$TMP/workspaces"
export BENCH_RESULTS_DIR="$TMP/results"
export CLAUDE_BIN="$HERE/fake-claude.sh"
export FAKE_CLAUDE_LOG="$TMP/claude-calls.log"
export ANTHROPIC_ADMIN_KEY="must-not-reach-the-agent"
export BENCH_TIMEOUT=120

failures=0
check() { # check <description> <condition-exit-code>
  if [[ "$2" -eq 0 ]]; then echo "ok   - $1"; else echo "FAIL - $1"; failures=$((failures + 1)); fi
}

for mode in single team; do
  bash "$ROOT/scripts/run.sh" "$mode" 1
  grep -Eq 'total=([0-9]+)/\1$' "$BENCH_RESULTS_DIR/${mode}_1/score.txt" # score equals the maximum
  check "$mode: all hidden tests pass" $?
done

node "$ROOT/scripts/aggregate.mjs" > /dev/null
check "summary.csv and summary.md are written" "$([[ -s "$BENCH_RESULTS_DIR/summary.csv" && -s "$BENCH_RESULTS_DIR/summary.md" ]] && echo 0 || echo 1)"

grep 'workspace=single_1' "$FAKE_CLAUDE_LOG" | grep -q -- '--disallowedTools Agent,Task'
check "single: Agent/Task tools are disallowed" $?
grep 'workspace=team_1' "$FAKE_CLAUDE_LOG" | grep -q 'teams=1'
check "team: agent-teams flag is set" $?
grep 'workspace=single_1' "$FAKE_CLAUDE_LOG" | grep -q 'teams=unset'
check "single: agent-teams flag is not set" $?
! grep -q 'admin=must-not' "$FAKE_CLAUDE_LOG"
check "admin key is removed from the agent environment" $?

# A run in which claude never reaches the model (expired login) must be flagged and excluded.
FAKE_CLAUDE_AUTH_FAIL=1 bash "$ROOT/scripts/run.sh" single 2 > /dev/null 2>&1 && code=0 || code=$?
check "auth failure: run exits 1" "$([[ $code -eq 1 ]] && echo 0 || echo 1)"
grep -q '^validity=invalid' "$BENCH_RESULTS_DIR/single_2/metrics.env"
check "auth failure: run is marked invalid" $?
check "auth failure: run is not scored" "$([[ ! -e "$BENCH_RESULTS_DIR/single_2/score.json" ]] && echo 0 || echo 1)"
node "$ROOT/scripts/aggregate.mjs" 2> /dev/null | grep -Eq '\| single \| 1 \(\+1 invalid\) \| [0-9.]+ ± 0\.0 \|'
check "auth failure: excluded from averages (std. dev. stays 0)" $?

BENCH_FORCE=0 bash "$ROOT/scripts/run.sh" single 1 > /dev/null 2>&1 && code=0 || code=$?
check "an existing run is not overwritten (exit 3)" "$([[ $code -eq 3 ]] && echo 0 || echo 1)"

if [[ $failures -gt 0 ]]; then echo "$failures check(s) failed"; exit 1; fi
echo "smoke test passed"
