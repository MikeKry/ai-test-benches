#!/usr/bin/env bash
# run.sh - execute ONE benchmark run: fresh OrchardCore clone -> claude -p -> scoring -> metrics.
#
# Usage:  scripts/run.sh <single|subagents|team> <run-number>
# Config: config.env / environment, see config.env.example.
#         BENCH_FORCE=1 overwrites an existing run (runs cost money, so the default is to refuse).
# Exit:   0 ok | 1 claude failed (timeouts and turn limits are still scored; a run that never
#         reached the model is marked invalid and not scored) | 2 usage error | 3 run already exists
set -uo pipefail
# shellcheck source=lib/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
}

check_prerequisites() {
  require_cmd git
  require_cmd node
  require_cmd dotnet
  require_cmd timeout
  require_cmd "$CLAUDE_BIN"
  [[ -d "$UPSTREAM/.git" ]] || die "no OrchardCore clone at $UPSTREAM (see README: Setup)"
  git -C "$UPSTREAM" cat-file -e "$BASE_COMMIT^{commit}" 2> /dev/null \
    || die "base commit $BASE_COMMIT is not in $UPSTREAM; run 'git -C upstream fetch'"
}

build_prompt() {
  local mode=$1
  printf '%s\n\n%s\n' "$(cat "$ROOT/prompts/$mode.md")" "$(cat "$ROOT/prompts/task.md")"
}

# One API key per mode lets the provider's usage analytics split spend by mode.
select_api_key() {
  local var
  var="KEY_$(upper "$1")"
  if [[ -n "${!var:-}" ]]; then
    export ANTHROPIC_API_KEY="${!var}"
  else
    warn "$var is not set; this run uses the current login (no per-mode usage split in analytics)"
  fi
}

# Agent teams are experimental and the flag also changes subagent behaviour,
# so it is enabled for team mode only.
configure_mode_env() {
  unset CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
  if [[ "$1" == team ]]; then export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1; fi
}

# Runs claude in the workspace. Secrets the agent does not need are removed from its environment.
run_claude() {
  local mode=$1 workspace=$2 out=$3
  local -a flags extra=() scrub=(-u ANTHROPIC_ADMIN_KEY)
  local m
  read -r -a flags <<< "$BENCH_CLAUDE_FLAGS"
  for m in "${MODES[@]}"; do scrub+=(-u "KEY_$(upper "$m")"); done
  # Without this the "single" baseline could silently delegate to subagents.
  if [[ "$mode" == single ]]; then extra=(--disallowedTools Agent,Task); fi

  # Real agent teams: in -p mode Claude never spawns teammates (named agents run as subagents), so with
  # BENCH_INTERACTIVE_TEAM=1 team mode runs in an interactive session in a PTY (amendment A2).
  # --max-turns is print-only; the time limit still applies. session.json is computed from the transcripts.
  if [[ "$mode" == team && "${BENCH_INTERACTIVE_TEAM:-0}" == 1 ]]; then
    build_prompt "$mode" > "$out/prompt.md"
    (cd "$workspace" && env "${scrub[@]}" node "$ROOT/../tools/interactive-run/run-interactive.mjs" \
      --cwd "$(cygpath -w "$workspace")" --prompt-file "$out/prompt.md" --out "$out" \
      --timeout-s "$BENCH_TIMEOUT" --quiet-s "${BENCH_QUIET_S:-180}" \
      -- --model "$BENCH_MODEL" "${flags[@]}") > "$out/interactive.log" 2> "$out/stderr.txt"
    return
  fi

  # In print mode background subagents are stopped 10 minutes after the main session's last turn
  # by default; the run must wait for them.
  (cd "$workspace" && env "${scrub[@]}" CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 timeout "$BENCH_TIMEOUT" "$CLAUDE_BIN" \
    -p "$(build_prompt "$mode")" \
    --output-format json --model "$BENCH_MODEL" --max-turns "$BENCH_MAX_TURNS" \
    "${flags[@]}" ${extra[@]+"${extra[@]}"}) > "$out/session.json" 2> "$out/stderr.txt"
}

# What the agent changed, including uncommitted work, relative to the base commit.
record_changes() {
  local workspace=$1 out=$2
  {
    echo "agent_commits=$(git -C "$workspace" rev-list --count "$BASE_COMMIT..HEAD")"
    echo "uncommitted_files=$(git -C "$workspace" status --porcelain | wc -l | tr -d ' ')"
  } >> "$out/metrics.env"
  git -C "$workspace" add -A
  git -C "$workspace" diff --cached "$BASE_COMMIT" > "$out/changes.patch"
  git -C "$workspace" diff --cached --stat "$BASE_COMMIT" > "$out/changes.stat"
  git -C "$workspace" reset -q
}

main() {
  if [[ $# -ne 2 ]]; then usage; exit 2; fi
  local mode=$1 run=$2
  is_valid_mode "$mode" || { log "unknown mode '$mode' (expected: ${MODES[*]})"; usage; exit 2; }
  [[ "$run" =~ ^[1-9][0-9]*$ ]] || { log "run number must be a positive integer"; usage; exit 2; }
  [[ -f "$ROOT/prompts/$mode.md" ]] || die "missing prompts/$mode.md"

  local workspace="$WORKDIR/${mode}_$run" out="$RESULTS_DIR/${mode}_$run"
  if [[ -e "$out" && "${BENCH_FORCE:-0}" != 1 ]]; then
    log "run $mode #$run already exists in $out (set BENCH_FORCE=1 to overwrite)"
    exit 3
  fi

  check_prerequisites
  stop_workspace_processes
  rm -rf "$out"
  mkdir -p "$out" "$WORKDIR"
  clone_base "$workspace" || die "could not create the workspace $workspace"
  select_api_key "$mode"
  configure_mode_env "$mode"

  local started ended code
  {
    echo "mode=$mode"
    echo "run=$run"
    echo "model=$BENCH_MODEL"
    echo "max_turns=$BENCH_MAX_TURNS"
    echo "base_commit=$BASE_COMMIT"
    echo "claude_version=$("$CLAUDE_BIN" --version 2>/dev/null | head -1)"
    echo "start_utc=$(date -u +%FT%TZ)"
  } > "$out/metrics.env"

  started=$(date +%s)
  run_claude "$mode" "$workspace" "$out"
  code=$?
  ended=$(date +%s)

  {
    echo "end_utc=$(date -u +%FT%TZ)"
    echo "duration_s=$((ended - started))"
    echo "claude_exit=$code"
  } >> "$out/metrics.env"

  # A run in which claude never reached the model (expired login, API error) is not scored:
  # there is nothing to measure and an unchanged workspace would only distort the averages.
  local verdict
  verdict="$(node "$ROOT/scripts/classify-run.mjs" "$out")"
  if [[ "$verdict" == invalid* ]]; then
    echo "$mode #$run: INVALID, not scored and excluded from the summary (${verdict#invalid: })"
    exit 1
  fi

  stop_workspace_processes
  record_changes "$workspace" "$out"
  bash "$ROOT/scripts/score.sh" "$workspace" "$out" > /dev/null
  echo "$mode #$run: $(cat "$out/score.txt" 2> /dev/null || echo 'not scored') in $((ended - started))s (claude exit $code)"
  [[ $code -eq 0 ]]
}

main "$@"
