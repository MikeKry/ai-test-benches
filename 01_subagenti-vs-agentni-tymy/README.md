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

## What the agents were told

There is no custom system prompt and no agent definition file (`.claude/agents/`). Every run uses Claude
Code's default system prompt, and the whole instruction is the first user message, built by
`scripts/run.sh` from the files in `prompts/`:

| Part | File | Content |
|---|---|---|
| mode | `prompts/single.md`, `subagents.md`, `team.md` | how to work: alone, with subagents, or as a team lead; the roles (e.g. `di-dev`, `integrator`) are defined here |
| task | `prompts/task.md` | the task itself and the rules (build economically, commit per issue, do not push) |
| issues (V3 only) | `prompts/issues.md` | a snapshot of the five GitHub issues with comments, so no network access is needed |

Subagents and teammates get only what the lead passes to them; the mode prompt tells the lead to pass the
full task. In single mode the `Agent`/`Task` tools are disabled, agent teams are enabled
(`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) only in team mode. The V3 blind reviewer's instruction is
`orchardcore-backlog/acceptance/review/judge.md`.

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
