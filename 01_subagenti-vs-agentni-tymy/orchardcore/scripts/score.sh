#!/usr/bin/env bash
# score.sh - judge a finished workspace.
#
# Usage:  scripts/score.sh <workspace> <output-dir>
# Steps:  1. build the agent's change as it is (build.log)
#         2. add the hidden tests, build, run them on SQLite and, with Docker, on PostgreSQL
#         3. run the rest of OrchardCore.Tests (regressions and the agent's own tests)
#         4. put only the agent's test changes on the base commit: do they catch the bug?
# Writes: xUnit XML results and logs per step, score.json and score.txt in <output-dir>.
# The hidden tests are copied into the workspace only after the agent has finished.
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

readonly TEST_DIR=test/OrchardCore.Tests
readonly TEST_EXE="$TEST_DIR/bin/Debug/net11.0/OrchardCore.Tests.exe"

usage() {
  sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

build() { # build <workspace> <log>
  (cd "$1" && run_logged "$2" dotnet build "$TEST_PROJECT" -c Debug)
}

run_tests() { # run_tests <workspace> <xml> <log> <xunit filter args...>
  local workspace=$1 xml=$2 log_file=$3
  shift 3
  (cd "$workspace/$(dirname "$TEST_EXE")" \
    && run_logged "$log_file" "./$(basename "$TEST_EXE")" -noColor -xml "$(cygpath -w "$xml" 2> /dev/null || echo "$xml")" "$@")
}

# Starts a throw-away PostgreSQL container and prints its connection string; empty when unavailable.
start_postgres() {
  local name=$1 port
  [[ -n "$BENCH_POSTGRES_IMAGE" ]] && command -v docker > /dev/null 2>&1 || return 0
  docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=bench -P "$BENCH_POSTGRES_IMAGE" > /dev/null 2>&1 || return 0
  port="$(docker port "$name" 5432/tcp | head -1 | sed 's/.*://')"
  for _ in $(seq 60); do
    docker exec "$name" pg_isready -U postgres > /dev/null 2>&1 && break
    sleep 1
  done
  echo "Host=localhost;Port=$port;Database=postgres;Username=postgres;Password=bench"
}

score_hidden() {
  local workspace=$1 out=$2
  rm -rf "$workspace/$TEST_DIR/BenchHidden"
  cp -r "$ROOT/hidden-tests/BenchHidden" "$workspace/$TEST_DIR/"
  build "$workspace" "$out/hidden-build.log" || return 0

  run_tests "$workspace" "$out/hidden-sqlite.xml" "$out/hidden-sqlite.log" -namespace "$HIDDEN_NAMESPACE"

  local container connection
  container="bench-pg-$$"
  connection="$(start_postgres "$container")"
  if [[ -n "$connection" ]]; then
    BENCH_DB_PROVIDER=Postgres BENCH_DB_CONNECTION="$connection" \
      run_tests "$workspace" "$out/hidden-postgres.xml" "$out/hidden-postgres.log" -namespace "$HIDDEN_NAMESPACE"
    docker stop "$container" > /dev/null 2>&1
  else
    warn "PostgreSQL pass skipped (no docker or BENCH_POSTGRES_IMAGE is empty)"
  fi

  run_tests "$workspace" "$out/regression.xml" "$out/regression.log" -namespace- "$HIDDEN_NAMESPACE"
  rm -rf "$workspace/$TEST_DIR/BenchHidden"
}

# Applies only the agent's changes under test/ to the base commit and runs them there.
# A good test fails without the fix; failures already present on the base are subtracted later.
score_agent_tests_on_base() {
  local out=$1 check="$WORKDIR/_base-check"
  [[ -s "$out/changes.patch" ]] || return 0
  clone_base "$check" || return 0
  if ! git -C "$check" apply --include='test/*' "$out/changes.patch" 2> "$out/base-check-apply.log"; then
    return 0
  fi
  [[ -n "$(git -C "$check" status --porcelain)" ]] || { echo "no test changes" > "$out/base-check-build.log"; return 0; }
  if build_without_uncompilable_tests "$check" "$out"; then
    run_tests "$check" "$out/base-check.xml" "$out/base-check.log" -namespace- "$HIDDEN_NAMESPACE"
  fi
  stop_workspace_processes
  rm -rf "$check"
}

# Tests that use an API the fix introduces do not compile on the base commit. Such files are put
# back to their base version (or removed when new) and listed in base-check-excluded.txt; the
# remaining tests still show whether they catch the bug.
build_without_uncompilable_tests() {
  local check=$1 out=$2 attempt files file rel
  : > "$out/base-check-excluded.txt"
  for attempt in 1 2 3 4 5; do
    build "$check" "$out/base-check-build.log" && return 0
    files="$(grep -aoE '[A-Za-z]:\\[^(]*\.cs\(' "$out/base-check-build.log" | sed 's/($//' | sort -u)"
    [[ -n "$files" ]] || return 1
    while read -r file; do
      rel="${file#*\\_base-check\\}"
      rel="${rel//\\//}"
      [[ "$rel" == test/* ]] || return 1 # only test files may be excluded
      if git -C "$check" cat-file -e "$BASE_COMMIT:$rel" 2> /dev/null; then
        git -C "$check" checkout -q "$BASE_COMMIT" -- "$rel"
      else
        rm -f "$check/$rel"
      fi
      echo "$rel" >> "$out/base-check-excluded.txt"
    done <<< "$files"
  done
  return 1
}

main() {
  if [[ $# -ne 2 ]]; then usage; exit 2; fi
  [[ -d "$1/.git" ]] || die "workspace '$1' is not a git checkout"
  local workspace out
  workspace="$(cd "$1" && pwd)"
  mkdir -p "$2"
  out="$(cd "$2" && pwd)"
  rm -f "$out"/*.xml "$out"/score.json "$out"/score.txt

  require_cmd dotnet
  require_cmd node
  # The baseline run (scripts/baseline.sh) scores the base commit itself and creates the reference.
  [[ "$out" == "$ROOT/baseline" || -f "$ROOT/baseline/regression.xml" ]] \
    || die "missing baseline/regression.xml (run scripts/baseline.sh once)"
  stop_workspace_processes

  if build "$workspace" "$out/build.log"; then echo ok > "$out/build.status"; else echo failed > "$out/build.status"; fi
  score_hidden "$workspace" "$out"
  score_agent_tests_on_base "$out"

  node "$ROOT/scripts/score-report.mjs" "$out" | tee "$out/score.txt"
}

main "$@"
