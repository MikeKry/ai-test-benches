# Claude Code: single agent vs. subagents vs. agent teams

Three benchmarks that give the same task to the ways of working in Claude Code and compare quality, time and
token cost: one agent, subagents, a team of named agents under `claude -p`, and a real interactive agent team.

Write-up (Czech): [Agenti, subagenti, agentní týmy: dává to smysl na běžném stroji?](https://mkuzela.cz/cs/blog/subagenti-vs-agentni-tymy/)

| Benchmark | Task | Size | Quality is scored by |
|---|---|---|---|
| [`mini-kanban/`](mini-kanban/README.md) (V1) | build a small React + TypeScript Kanban app from scratch | small, greenfield | 54 hidden tests (unit, UI, architecture) |
| [`orchardcore/`](orchardcore/README.md) (V2) | fix OrchardCore issue #14810 in the real OrchardCore code base | large, existing code | 38 hidden tests on SQLite and PostgreSQL |
| [`orchardcore-backlog/`](orchardcore-backlog/README.md) (V3) | a backlog of 5 real OrchardCore issues: triage, implementation, tests, docs | large, open-ended | acceptance tests, blind model review, human check |

[`tools/interactive-run/`](tools/interactive-run/NOTES-driver.md) drives an interactive Claude Code session for
the real agent-team runs: Claude Code spawns teammates only in an interactive session, not under `claude -p`.

## What is not here

Only the benchmark itself: prompts, hidden tests, reference solutions, scoring and review scripts, and for V3
the rules written before the first run (`orchardcore-backlog/prereg/`). Finished runs, their workspaces,
transcripts, scores and logs are not included. Each run writes them to `results/` and `workspaces/`
(or `results-interactive/` and `workspaces-interactive/`), which are git-ignored.

## Running it

Each benchmark folder has its own README. In short: copy `config.env.example` to `config.env`, then run
`bash scripts/run.sh <single|subagents|team> <run number>` from the benchmark folder (Git Bash on Windows works).
The OrchardCore benchmarks need a local clone of OrchardCore (`BENCH_UPSTREAM`) and a .NET SDK; run
`scripts/baseline.sh` once before the first run.

Runs cost real tokens. In the write-up, 141 runs and the blind review cost about $251 at API prices.
