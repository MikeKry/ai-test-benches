#!/usr/bin/env bash
# Reruns team mode of V1 (15), V2 (5) and V3 (3) as real interactive agent teams, sequentially.
# Existing runs are skipped (run.sh refuses to overwrite), so the batch can be restarted.
set -uo pipefail
export PATH="$PATH:$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages/Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe"
export BENCH_INTERACTIVE_TEAM=1
T=$(cd "$(dirname "$0")/../.." && pwd)  # benchmark root
run() { # <benchmark dir> <run number>
  ( cd "$T/$1" && BENCH_RESULTS_DIR="$T/$1/results-interactive" BENCH_WORKDIR="$T/$1/workspaces-interactive" \
      bash scripts/run.sh team "$2" ) 2>&1 | grep -v '^WARN: KEY_TEAM' | sed "s|^|$(date +%H:%M) $1 |"
}
for i in $(seq 2 15); do run mini-kanban "$i"; done
for i in $(seq 1 5); do run orchardcore "$i"; done
for i in $(seq 1 3); do run orchardcore-backlog "$i"; done
echo "$(date +%H:%M) batch done"
