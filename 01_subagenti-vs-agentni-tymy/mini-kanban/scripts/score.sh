#!/usr/bin/env bash
# score.sh - run the hidden tests against a finished workspace.
#
# Usage:  scripts/score.sh <workspace> <output-dir>
# Writes: <output-dir>/{unit.json,ui.json,arch.txt,score.json,score.txt} plus *.log files per step.
# Prints: unit=U/N ui=P/N arch=A/N total=T/N   (maxima are defined in scripts/lib/common.mjs)
#
# The test tooling lives in hidden-tests/ (own node_modules). The agent's project is never
# modified and never contains the hidden tests.
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

readonly HIDDEN="$ROOT/hidden-tests"

usage() {
  sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

# Runs a command with stdout+stderr in a log file; a failing step must not abort scoring.
run_logged() {
  local log=$1
  shift
  "$@" > "$log" 2>&1
}

install_tooling() {
  local out=$1
  if [[ ! -d "$HIDDEN/node_modules/vitest" ]]; then
    (cd "$HIDDEN" && run_logged "$out/tooling-install.log" npm install --no-audit --no-fund)
  fi
  # No-op when the browser is already cached.
  (cd "$HIDDEN" && run_logged "$out/playwright-install.log" npx playwright install chromium)
}

score_unit() {
  local out=$1
  (cd "$HIDDEN" && run_logged "$out/unit.log" \
    npx vitest run --reporter=json --outputFile="$out/unit.json")
}

score_ui() {
  local out=$1
  (cd "$HIDDEN" && PLAYWRIGHT_JSON_OUTPUT_NAME="$out/ui.json" run_logged "$out/ui.log" \
    npx playwright test --reporter=json --output="$out/playwright-artifacts")
}

score_architecture() {
  local workspace=$1 out=$2
  (cd "$workspace" && run_logged "$out/arch.txt" bash "$HIDDEN/arch.sh")
}

main() {
  if [[ $# -ne 2 ]]; then usage; exit 2; fi
  [[ -d "$1" ]] || die "workspace '$1' does not exist"
  local workspace out
  workspace="$(cd "$1" && pwd)"
  mkdir -p "$2"
  out="$(cd "$2" && pwd)"

  require_cmd node
  require_cmd npm
  ensure_port_free
  export BENCH_WS="$workspace"

  install_tooling "$out"
  (cd "$workspace" && run_logged "$out/workspace-install.log" npm install --no-audit --no-fund)
  score_unit "$out"
  score_ui "$out"
  score_architecture "$workspace" "$out"

  node "$ROOT/scripts/score-report.mjs" "$out" | tee "$out/score.txt"
}

main "$@"
