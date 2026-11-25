#!/usr/bin/env bash
# Reruns the invalid interactive team runs. Each invalid result is moved to results-interactive/invalid/
# (kept as evidence) and the run is repeated under the same number. Stops at the first spend/usage limit
# so that no more runs are wasted.
set -uo pipefail
export PATH="$PATH:$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages/Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe"
export BENCH_INTERACTIVE_TEAM=1
T=$(cd "$(dirname "$0")/../.." && pwd)  # benchmark root
stamp=$(date +%Y%m%d-%H%M)
run() { # <benchmark dir> <run number>
  local res="$T/$1/results-interactive" line
  if [[ -d "$res/team_$2" ]]; then
    if ! grep -q '^validity=invalid' "$res/team_$2/metrics.env" 2> /dev/null; then return 0; fi
    mkdir -p "$res/invalid"
    mv "$res/team_$2" "$res/invalid/team_$2-$stamp"
  fi
  line=$( ( cd "$T/$1" && BENCH_RESULTS_DIR="$res" BENCH_WORKDIR="$T/$1/workspaces-interactive" \
      bash scripts/run.sh team "$2" ) 2>&1 | grep -v '^WARN: KEY_TEAM')
  echo "$(date +%H:%M) $1 $line"
  if grep -qi 'spend limit\|usage limit\|hit your' <<< "$line"; then echo "$(date +%H:%M) stopped: limit"; exit 1; fi
}
for i in $(seq 1 15); do run mini-kanban "$i"; done
for i in $(seq 1 5); do run orchardcore "$i"; done
for i in $(seq 1 3); do run orchardcore-backlog "$i"; done
echo "$(date +%H:%M) rerun done"
