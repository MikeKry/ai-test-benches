#!/usr/bin/env bash
# Shared helpers for the benchmark scripts. Source it, do not execute it.
#
# On load it reads config.env (values already present in the environment win),
# applies defaults and exposes ROOT, MODES, WORKDIR and RESULTS_DIR.

[[ -n "${_BENCH_COMMON_LOADED:-}" ]] && return 0
_BENCH_COMMON_LOADED=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly ROOT
readonly MODES=(single subagents team)
readonly DEV_SERVER_PORT=5173

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

# True when something already listens on the dev-server port (hidden UI tests need it free).
port_in_use() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

ensure_port_free() {
  ! port_in_use "$DEV_SERVER_PORT" \
    || die "port $DEV_SERVER_PORT is in use; stop the other dev server (the UI tests need it)"
}

load_config

: "${CLAUDE_BIN:=claude}"
: "${BENCH_MODEL:=sonnet}"
: "${BENCH_MAX_TURNS:=80}"
: "${BENCH_TIMEOUT:=3600}"
: "${BENCH_CLAUDE_FLAGS:=--permission-mode acceptEdits --allowedTools Bash,Edit,Write,Read,Glob,Grep,Agent,Task,TodoWrite,SendMessage,TaskCreate,TaskUpdate,TaskList,TaskGet}"
: "${BENCH_WORKDIR:=$ROOT/workspaces}"
: "${BENCH_RESULTS_DIR:=$ROOT/results}"
WORKDIR="$BENCH_WORKDIR"
RESULTS_DIR="$BENCH_RESULTS_DIR"

# Agents sometimes leave their dev server running. Stop servers started from a benchmark workspace
# (Windows only; elsewhere the port check in ensure_port_free still reports the problem).
stop_stray_dev_servers() {
  command -v powershell > /dev/null 2>&1 || return 0
  local needle
  needle="$(cygpath -w "$WORKDIR" 2> /dev/null)" || return 0
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*${needle//\/\\}*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" > /dev/null 2>&1 || true
}
