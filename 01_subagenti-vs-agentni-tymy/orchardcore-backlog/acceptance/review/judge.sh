#!/usr/bin/env bash
# judge.sh - runs the blind review: one independent claude session per packet (results/review/packet-*.md).
# Usage: acceptance/review/judge.sh [packet ...]   (default: every packet without a verdict yet)
# Writes results/review/verdict-<issue>-pass<n>.json (the judge's JSON) and .session.json (raw CLI output).
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dir="$root/results/${REVIEW_DIR:-review}"
model="${JUDGE_MODEL:-claude-opus-5-5}"
prompt="$(cat "$root/acceptance/review/judge.md")"

packets=("$@")
[[ ${#packets[@]} -eq 0 ]] && packets=("$dir"/packet-*.md)

for packet in "${packets[@]}"; do
  name="$(basename "$packet" .md)"
  verdict="$dir/${name/packet/verdict}.json"
  [[ -s "$verdict" ]] && { echo "skip $name"; continue; }
  echo "judging $name"
  # A fresh session per packet, no tools, run outside the repository so nothing but the packet is visible.
  (cd "$(mktemp -d)" && claude -p --model "$model" --output-format json --max-turns 1 --tools "" \
    --append-system-prompt "$prompt" < "$packet") > "$dir/${name/packet/verdict}.session.json"
  node -e '
    const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const text = s.result ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    JSON.parse(json);
    require("fs").writeFileSync(process.argv[2], json);
    console.log(`  ok, $${(s.total_cost_usd ?? 0).toFixed(2)}`);
  ' "$dir/${name/packet/verdict}.session.json" "$verdict" || echo "  FAILED: $name"
done
