#!/usr/bin/env bash
# rescore.sh - run the hidden tests again on all finished runs and refresh the summary.
#
# Usage:  scripts/rescore.sh
# Use it after the hidden tests changed, so every run is judged by the same tests.
# Needs the workspaces of the runs (workspaces/<mode>_<n>); invalid runs are skipped. Takes about 20 minutes per run.
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

main() {
  [[ -d "$RESULTS_DIR" ]] || die "no results directory at $RESULTS_DIR"
  local out name workspace
  for out in "$RESULTS_DIR"/*/; do
    out="${out%/}"
    name="$(basename "$out")"
    [[ -f "$out/metrics.env" ]] || continue
    if grep -q '^validity=invalid' "$out/metrics.env"; then
      log "skipping $name (invalid run)"
      continue
    fi
    workspace="$WORKDIR/$name"
    if [[ ! -d "$workspace" ]]; then
      warn "$name: workspace is missing, keeping the old score"
      continue
    fi
    bash "$ROOT/scripts/score.sh" "$workspace" "$out" > /dev/null
    echo "$name: $(cat "$out/score.txt" 2> /dev/null || echo 'not scored')"
  done
  node "$ROOT/scripts/aggregate.mjs"
}

main "$@"
