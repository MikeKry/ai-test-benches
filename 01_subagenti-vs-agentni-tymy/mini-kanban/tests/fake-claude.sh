#!/usr/bin/env bash
# Stand-in for the `claude` CLI, used by tests/smoke.sh (spends no tokens).
# It behaves like a perfect agent: copies the reference solution into the current directory
# (the workspace), records how it was invoked and prints a result JSON.
#
# FAKE_CLAUDE_LOG - optional file; one line per invocation (workspace, flags, relevant env)
set -euo pipefail

if [[ "${1:-}" == "--version" ]]; then echo "0.0.0-fake"; exit 0; fi

# FAKE_CLAUDE_AUTH_FAIL=1 simulates an expired login: error result, no usage, exit 1.
if [[ "${FAKE_CLAUDE_AUTH_FAIL:-}" == 1 ]]; then
  echo '{"type":"result","is_error":true,"num_turns":1,"total_cost_usd":0,"usage":{"input_tokens":0,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0},"modelUsage":{},"result":"Failed to authenticate: this login reached its time limit"}'
  exit 1
fi

REFERENCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../reference" && pwd)"
cp -r "$REFERENCE/." .

if [[ -n "${FAKE_CLAUDE_LOG:-}" ]]; then
  flags=()
  previous=""
  for arg in "$@"; do
    [[ "$previous" == "-p" ]] || flags+=("$arg") # drop the (long) prompt
    previous=$arg
  done
  echo "workspace=$(basename "$PWD") flags=${flags[*]} teams=${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-unset} admin=${ANTHROPIC_ADMIN_KEY:-unset}" \
    >> "$FAKE_CLAUDE_LOG"
fi

cat <<'JSON'
{"type":"result","subtype":"success","is_error":false,"duration_ms":1000,"num_turns":3,"total_cost_usd":0.123,
 "usage":{"input_tokens":1000,"output_tokens":2000,"cache_creation_input_tokens":3000,"cache_read_input_tokens":4000}}
JSON
