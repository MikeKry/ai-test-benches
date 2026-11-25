#!/usr/bin/env bash
# run.sh - runs the acceptance tests (acceptance/tests/*.cs) against finished workspaces.
#
# Usage:  acceptance/run.sh [run-id ...]     (default: every results/<mode>_<n> with a workspace)
# For each run: copies the tests into test/OrchardCore.Tests/BenchAcceptance of the workspace, exports the
# per-run adapter (acceptance/adapters/<run>.env, or $ACC_ADAPTERS/<run>.env), builds OrchardCore.Tests, runs only the acceptance
# namespace and writes results/<run>/acceptance.xml and acceptance.log. The copied files are removed again.
set -uo pipefail
# shellcheck source=../scripts/lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/lib/common.sh"
here="$ROOT/acceptance"
project=OrchardCore.Tests

runs=("$@")
if [[ ${#runs[@]} -eq 0 ]]; then
  for dir in "$RESULTS_DIR"/*_[0-9]*; do
    [[ -d "$WORKDIR/$(basename "$dir")" ]] && runs+=("$(basename "$dir")")
  done
fi

for run in "${runs[@]}"; do
  workspace="$WORKDIR/$run"
  out="$RESULTS_DIR/$run"
  target="$workspace/test/$project/BenchAcceptance"
  log "acceptance: $run"
  rm -rf "$target" && mkdir -p "$target" && cp "$here"/tests/*.cs "$target/"

  # Adapter: KEY=VALUE lines exported for the test process.
  adapters="${ACC_ADAPTERS:-$here/adapters}"
  if [[ -f "$adapters/$run.env" ]]; then
    set -a; source "$adapters/$run.env"; set +a
  fi

  if (cd "$workspace" && run_logged "$out/acceptance-build.log" dotnet build "test/$project/$project.csproj" -c Debug); then
    bin="$workspace/test/$project/bin/Debug/net11.0"
    (cd "$bin" && run_logged "$out/acceptance.log" "./$project.exe" -noColor -namespace OrchardCore.Tests.BenchAcceptance \
      -xml "$(cygpath -w "$out/acceptance.xml" 2> /dev/null || echo "$out/acceptance.xml")")
    log "  $(grep -E 'Total:|Failed:' "$out/acceptance.log" | tail -1)"
  else
    log "  build failed, see $out/acceptance-build.log"
  fi

  rm -rf "$target"
  stop_workspace_processes
  # Unset the adapter so the next run starts clean.
  [[ -f "$adapters/$run.env" ]] && unset $(grep -oE '^[A-Z0-9_]+' "$adapters/$run.env")
done
