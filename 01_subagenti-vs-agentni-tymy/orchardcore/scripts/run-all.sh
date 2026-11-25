#!/usr/bin/env bash
# run-all.sh - run every mode N times and print the summary.
#
# Usage:  scripts/run-all.sh [runs-per-mode=3]
# Modes are interleaved and their order rotates each round, so time-of-day and cache effects
# do not favour one mode. Finished runs are skipped; invalid (claude never reached the model) and
# interrupted ones are repeated, so a stopped batch can simply be started again (BENCH_FORCE=1 re-runs all).
# Exit:   0 all runs succeeded | 1 at least one run failed | 2 usage error
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

main() {
  local rounds=${1:-3}
  [[ "$rounds" =~ ^[1-9][0-9]*$ ]] || { usage; exit 2; }

  keep_awake_while $$

  local failed=0 round i mode
  for ((round = 1; round <= rounds; round++)); do
    for ((i = 0; i < ${#MODES[@]}; i++)); do
      mode=${MODES[$(((i + round - 1) % ${#MODES[@]}))]}
      local metrics="$RESULTS_DIR/${mode}_$round/metrics.env" force=${BENCH_FORCE:-0}
      if [[ -f "$metrics" && "$force" != 1 ]]; then
        # validity= is written only after a run finished, so interrupted runs are repeated too.
        if grep -q '^validity=valid' "$metrics"; then
          log "skipping $mode #$round (already done)"
          continue
        fi
        log "re-running $mode #$round (previous attempt was invalid or incomplete)"
        force=1
      fi
      BENCH_FORCE=$force bash "$ROOT/scripts/run.sh" "$mode" "$round" \
        || { failed=$((failed + 1)); warn "$mode #$round failed"; }
    done
  done

  node "$ROOT/scripts/aggregate.mjs"
  if ((failed > 0)); then warn "$failed run(s) failed, see results/*/stderr.txt"; fi
  ((failed == 0))
}

main "$@"
