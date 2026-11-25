#!/usr/bin/env bash
# baseline.sh - score the unchanged base commit once; every run is compared against it.
#
# Usage:  scripts/baseline.sh
# Writes: baseline/regression-<project>.xml   results of every scored test project on the base commit
# Takes a full build plus the test runs (about 15 minutes).
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

main() {
  local workspace="$WORKDIR/_baseline"
  mkdir -p "$WORKDIR" "$ROOT/baseline"
  clone_base "$workspace" || die "could not clone the base commit"
  bash "$ROOT/scripts/score.sh" "$workspace" "$ROOT/baseline"
  stop_workspace_processes
  rm -rf "$workspace"
}

main "$@"
