#!/usr/bin/env bash
# score.sh - automatic checks of a finished V3 workspace (the secondary outcomes of prereg/rubric.md).
#
# Usage:  scripts/score.sh <workspace> <output-dir>
# Steps:  1. build and run every project in TEST_PROJECTS as the agent left it
#            (regressions against baseline/, and the agent's own tests)
#         2. put only the agent's test changes on the base commit: which of its tests fail there?
#         3. commits per issue, BACKLOG.md, release notes, test files outside the scored projects
# Writes: xUnit XML results and logs per step, score.json and score.txt in <output-dir>.
# The quality score (acceptance tests, blind review) is assigned separately after all runs.
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

project_file() { echo "test/$1/$1.csproj"; }

build() { # build <workspace> <project> <log>
  (cd "$1" && run_logged "$3" dotnet build "$(project_file "$2")" -c Debug)
}

run_tests() { # run_tests <workspace> <project> <xml> <log>
  local dir="$1/test/$2/bin/Debug/net11.0"
  [[ -x "$dir/$2.exe" || -f "$dir/$2.exe" ]] || { echo "no test executable" > "$4"; return 1; }
  (cd "$dir" && run_logged "$4" "./$2.exe" -noColor -xml "$(cygpath -w "$3" 2> /dev/null || echo "$3")")
}

# Builds and runs every scored test project; <prefix> names the files (regression or base-check).
score_projects() {
  local workspace=$1 out=$2 prefix=$3 project status=ok
  for project in "${TEST_PROJECTS[@]}"; do
    if build "$workspace" "$project" "$out/$prefix-build-$project.log"; then
      run_tests "$workspace" "$project" "$out/$prefix-$project.xml" "$out/$prefix-$project.log"
    else
      status=failed
    fi
  done
  echo "$status"
}

# Applies only the agent's changes under test/ to the base commit and runs them there.
# A good test fails without the change; failures already present on the base are subtracted later.
score_agent_tests_on_base() {
  local out=$1 check="$WORKDIR/_base-check"
  [[ -s "$out/changes.patch" ]] || return 0
  clone_base "$check" || return 0
  if ! git -C "$check" apply --include='test/*' "$out/changes.patch" 2> "$out/base-check-apply.log"; then
    return 0
  fi
  [[ -n "$(git -C "$check" status --porcelain)" ]] || { echo "no test changes" > "$out/base-check-status.txt"; return 0; }
  local project
  : > "$out/base-check-excluded.txt"
  for project in "${TEST_PROJECTS[@]}"; do
    if build_without_uncompilable_tests "$check" "$project" "$out"; then
      run_tests "$check" "$project" "$out/base-check-$project.xml" "$out/base-check-$project.log"
    fi
  done
  echo ran > "$out/base-check-status.txt"
  stop_workspace_processes
  rm -rf "$check"
}

# Tests that use an API the change introduces do not compile on the base commit. Such files are put
# back to their base version (or removed when new) and listed in base-check-excluded.txt; the
# remaining tests still show whether they detect the missing change.
build_without_uncompilable_tests() {
  local check=$1 project=$2 out=$3 log attempt files file rel
  log="$out/base-check-build-$project.log"
  for attempt in 1 2 3 4 5 6 7 8; do
    build "$check" "$project" "$log" && return 0
    files="$(grep -aoE '[A-Za-z]:\\[^(]*\.cs\(' "$log" | sed 's/($//' | sort -u)"
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

# Facts about the agent's commits and files, read by score-report.mjs.
record_repository_facts() {
  local workspace=$1 out=$2
  git -C "$workspace" log --reverse --format='%s' "$BASE_COMMIT..HEAD" > "$out/commit-subjects.txt"
  git -C "$workspace" cat-file -e HEAD:BACKLOG.md 2> /dev/null && echo committed > "$out/backlog-status.txt" \
    || { [[ -f "$workspace/BACKLOG.md" ]] && echo uncommitted > "$out/backlog-status.txt" || echo missing > "$out/backlog-status.txt"; }
  # Every file the agent touched, committed or not.
  git -C "$workspace" add -A
  git -C "$workspace" diff --cached --name-status "$BASE_COMMIT" > "$out/changed-files.txt"
  git -C "$workspace" reset -q
}

main() {
  if [[ $# -ne 2 ]]; then usage; exit 2; fi
  [[ -d "$1/.git" ]] || die "workspace '$1' is not a git checkout"
  local workspace out
  workspace="$(cd "$1" && pwd)"
  mkdir -p "$2"
  out="$(cd "$2" && pwd)"
  rm -f "$out"/*.xml "$out"/score.json "$out"/score.txt "$out"/base-check-status.txt

  require_cmd dotnet
  require_cmd node
  # The baseline run (scripts/baseline.sh) scores the base commit itself and creates the reference.
  [[ "$out" == "$ROOT/baseline" || -f "$ROOT/baseline/regression-OrchardCore.Tests.xml" ]] \
    || die "missing baseline/regression-*.xml (run scripts/baseline.sh once)"
  stop_workspace_processes

  score_projects "$workspace" "$out" regression > "$out/build.status"
  stop_workspace_processes
  if [[ "$out" != "$ROOT/baseline" ]]; then
    record_repository_facts "$workspace" "$out"
    score_agent_tests_on_base "$out"
  fi

  node "$ROOT/scripts/score-report.mjs" "$out" | tee "$out/score.txt"
}

main "$@"
