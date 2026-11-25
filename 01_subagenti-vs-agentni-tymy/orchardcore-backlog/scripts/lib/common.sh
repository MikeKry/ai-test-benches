#!/usr/bin/env bash
# Shared helpers for the benchmark scripts. Source it, do not execute it.
#
# On load it reads config.env (values already present in the environment win),
# applies defaults and exposes ROOT, MODES, UPSTREAM, BASE_COMMIT, WORKDIR and RESULTS_DIR.

[[ -n "${_BENCH_COMMON_LOADED:-}" ]] && return 0
_BENCH_COMMON_LOADED=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly ROOT
readonly MODES=(single subagents team)
# The xUnit test projects that are built and run when scoring (regressions and the agent's own tests).
readonly TEST_PROJECTS=(OrchardCore.Tests OrchardCore.Abstractions.Tests)
# The five backlog issues, in the order of the task.
readonly ISSUES=(18455 14197 10539 10285 9662)

log()  { printf '%s\n' "$*" >&2; }
warn() { log "WARN: $*"; }
die()  { log "ERROR: $*"; exit 1; }

upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command '$1' was not found in PATH"
}

is_valid_mode() {
  local mode
  for mode in "${MODES[@]}"; do [[ "$mode" == "$1" ]] && return 0; done
  return 1
}

# Reads KEY=VALUE lines from config.env without executing it. Existing environment
# variables take precedence, so `BENCH_MODEL=opus bash scripts/run.sh ...` works.
load_config() {
  local file="$ROOT/config.env" key value
  [[ -f "$file" ]] || return 0
  while IFS='=' read -r key value || [[ -n "$key" ]]; do
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    [[ -z "${!key+x}" ]] || continue
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    printf -v "$key" '%s' "$value"
  done < "$file"
}

# Runs a command with stdout+stderr in a log file; callers decide what a failure means.
run_logged() {
  local log_file=$1
  shift
  "$@" > "$log_file" 2>&1
}

load_config

: "${CLAUDE_BIN:=claude}"
: "${BENCH_MODEL:=sonnet}"
# Five issues instead of one: more turns and time than V2 (orchardcore/).
: "${BENCH_MAX_TURNS:=800}"
: "${BENCH_TIMEOUT:=14400}"
# PowerShell and Monitor are offered on Windows; without them in the list, headless runs deny those calls
# (amendment A1, prereg/amendments.md).
: "${BENCH_CLAUDE_FLAGS:=--permission-mode acceptEdits --allowedTools Bash,PowerShell,Monitor,TaskOutput,TaskStop,Edit,Write,Read,Glob,Grep,Agent,Task,TodoWrite,SendMessage,TaskCreate,TaskUpdate,TaskList,TaskGet}"
# The OrchardCore clone of benchmark V2 is reused (same pinned commit, see prereg/ground-truth.md).
: "${BENCH_UPSTREAM:=$ROOT/../orchardcore/upstream}"
# Every run starts from this commit of OrchardCore main (pinned for reproducibility).
: "${BENCH_BASE_COMMIT:=c5583e57dc675b9581231bbb6c4e8bd1ed91c845}"
: "${BENCH_WORKDIR:=$ROOT/workspaces}"
: "${BENCH_RESULTS_DIR:=$ROOT/results}"
UPSTREAM="$BENCH_UPSTREAM"
BASE_COMMIT="$BENCH_BASE_COMMIT"
WORKDIR="$BENCH_WORKDIR"
RESULTS_DIR="$BENCH_RESULTS_DIR"

# MSBuild and build-server processes outlive a build and keep files of the workspace locked;
# they are disabled for the agent and for scoring.
export MSBUILDDISABLENODEREUSE=1
export DOTNET_CLI_USE_MSBUILD_SERVER=0
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1

# Agents sometimes leave the CMS or a test host running. Stops every process whose command line
# points into the workspace directory (Windows only; elsewhere a no-op).
stop_workspace_processes() {
  command -v powershell > /dev/null 2>&1 || return 0
  local needle
  needle="$(cygpath -w "$WORKDIR" 2> /dev/null)" || return 0
  powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*${needle}*' -and \$_.ProcessId -ne \$PID } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" > /dev/null 2>&1 || true
}

# A batch runs for hours; sleep would stop the agent and distort the measured time. Keeps Windows
# from idle sleep (SetThreadExecutionState, no settings change) as long as process <pid> lives.
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED: on Modern Standby laptops the system
# requirement alone does not stop the idle timeout from suspending all desktop processes.
keep_awake_while() {
  command -v powershell > /dev/null 2>&1 || return 0
  local winpid
  winpid="$(cat "/proc/$1/winpid" 2> /dev/null)" || return 0
  powershell -NoProfile -Command "
    Add-Type -Namespace Bench -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint flags);'
    [Bench.Power]::SetThreadExecutionState(0x80000003) | Out-Null
    while (Get-Process -Id $winpid -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30 }" > /dev/null 2>&1 &
}

# A fresh, self-contained clone of the pinned commit on branch `bench`. A clone (not a worktree)
# keeps other runs' branches invisible to the agent. Objects are hard-linked, so it is fast.
clone_base() {
  local target=$1
  rm -rf "$target"
  git clone -q --no-checkout "$UPSTREAM" "$target" || return 1
  git -C "$target" checkout -q -b bench "$BASE_COMMIT" || return 1
  git -C "$target" remote remove origin
  git -C "$target" config user.name bench
  git -C "$target" config user.email bench@localhost
}
