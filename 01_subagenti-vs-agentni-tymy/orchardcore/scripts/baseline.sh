#!/usr/bin/env bash
# baseline.sh - score the unmodified base commit once; every run is compared against it.
#
# Usage:  scripts/baseline.sh
# Writes: baseline/regression.xml  OrchardCore.Tests on the base commit; tests that already fail
#                                  there are not counted as regressions of a run
#         baseline/hidden-*.xml    the hidden tests on the base commit: the ones that fail here
#                                  are the ones the task has to fix
# Takes a full build plus the test runs (about 20 minutes).
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

main() {
  local workspace="$WORKDIR/_baseline"
  mkdir -p "$WORKDIR"
  clone_base "$workspace" || die "could not clone the base commit"
  bash "$ROOT/scripts/score.sh" "$workspace" "$ROOT/baseline"
  stop_workspace_processes
  rm -rf "$workspace"
}

main "$@"
