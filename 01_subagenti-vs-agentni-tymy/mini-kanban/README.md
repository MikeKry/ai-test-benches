# Subagents vs. agent teams in Claude Code: Mini Kanban benchmark

A reproducible benchmark that gives the same task to three ways of working in Claude Code and compares
**quality, time and token usage**:

| Mode | Description |
|---|---|
| `single` | one session does everything sequentially (subagent tools are disabled) |
| `subagents` | the main session delegates to role-based subagents |
| `team` | an experimental agent team with a lead, teammates, shared task list and messaging |

Each run builds a small React + TypeScript Kanban app from `prompts/task.md` in a fresh workspace.
Afterwards the hidden tests (54 in total: 30 unit, 19 UI, 5 architecture checks) score the result.
Every hidden test follows from the task description; none relies on unspecified behaviour.

## Requirements

- Claude Code CLI (`claude`) on `PATH`, or set `CLAUDE_BIN`. Agent teams need version 2.1.32 or newer.
- Node.js 20+ and npm, git, and bash (on Windows: Git Bash).
- Network access on first use (npm packages, Chromium download of about 120 MB).
- Runs spend tokens. Start with a single run and check its output before launching a batch.

## Quick start

```bash
cp config.env.example config.env      # optional, defaults work
bash tests/smoke.sh                   # verify the pipeline without spending tokens (about 1 min)
bash scripts/run.sh single 1          # one real run
bash scripts/run-all.sh 3             # 3 runs per mode, interleaved
node scripts/aggregate.mjs            # re-create the summary any time
```

`run-all.sh` skips runs that already exist, so an interrupted batch can be restarted.
`run.sh` refuses to overwrite a finished run unless `BENCH_FORCE=1` is set.

## Layout

| Path | Purpose |
|---|---|
| `prompts/` | task description with the fixed interface contract, plus one instruction file per mode |
| `hidden-tests/` | the acceptance tests and their tooling; never copied into the agent's workspace |
| `scripts/run.sh` | one run: workspace, `claude -p`, metrics, scoring |
| `scripts/run-all.sh` | batch of runs with rotating mode order |
| `scripts/score.sh`, `score-report.mjs` | run the hidden tests, write `score.json` |
| `scripts/aggregate.mjs` | `summary.csv` and `summary.md` (mean ± sample standard deviation) |
| `scripts/lib/` | shared helpers for bash and Node |
| `reference/` | hand-written reference solution; must pass every hidden test |
| `tests/` | `smoke.sh` end-to-end test of the harness and the fake `claude` it uses |

## Configuration

`config.env` holds plain `KEY=VALUE` lines (it is parsed, not executed). Variables already set in the
environment win over the file. See `config.env.example` for all options.

| Variable | Default | Meaning |
|---|---|---|
| `BENCH_MODEL` | `sonnet` | model used in every mode |
| `BENCH_MAX_TURNS` | `80` | `--max-turns` limit per run |
| `BENCH_TIMEOUT` | `3600` | seconds before a run is killed |
| `BENCH_CLAUDE_FLAGS` | `acceptEdits` + allowed tools | permission flags (headless runs cannot ask) |
| `CLAUDE_BIN` | `claude` | path to the CLI |
| `BENCH_WORKDIR`, `BENCH_RESULTS_DIR` | `workspaces/`, `results/` | output locations |
| `KEY_SINGLE`, `KEY_SUBAGENTS`, `KEY_TEAM` | unset | optional API key per mode |

## Output

Per run, in `results/<mode>_<n>/`:

| File | Content |
|---|---|
| `metrics.env` | mode, model, CLI version, start/end (UTC), duration, claude exit code |
| `session.json` | raw `claude -p --output-format json` result (tokens, cost, turns) |
| `score.json`, `score.txt` | hidden-test result, e.g. `unit=30/30 ui=19/19 arch=5/5 total=54/54` |
| `*.log`, `unit.json`, `ui.json`, `arch.txt` | raw output of each scoring step, for debugging |
| `stderr.txt` | stderr of the claude process |

`results/summary.csv` and `summary.md` aggregate all runs.

## How measurement works

- **Invalid runs:** if `claude` never reaches the model (expired login, API error), the run is marked
  `validity=invalid` in `metrics.env`, is not scored and is excluded from the averages (it stays in
  `summary.csv`). `run-all.sh` repeats such runs. Runs that hit the time or turn limit did real work and count.
- **Quality:** pass rate of the hidden tests. Reliable and independent of any account type.
- **Time:** wall clock around `claude -p`. Reliable.
- **Tokens and cost:** taken from `session.json` (`modelUsage` when present, otherwise `usage`). It is **not
  guaranteed** that these numbers include subagent and teammate usage. Verify this on one run per mode,
  for example by comparing against your account's usage view. `total_cost_usd` is an estimate based on list
  prices, not a bill.

## Design notes

- Every run starts from an empty git repository with one commit, in its own directory.
- The hidden tests and their dependencies live outside the workspace, so the agent can neither see them
  nor have its `package.json` modified. The scoring step installs only the agent's own dependencies.
- Playwright starts and stops the dev server (`--strictPort` on 5173); runs must not overlap and the port
  must be free. `run.sh` checks this before spending any tokens.
- The agent-teams flag (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) is set only in `team` mode because it also
  changes subagent behaviour. `ANTHROPIC_ADMIN_KEY` and the per-mode keys are removed from the agent's
  environment.
- The WIP-limit unit test captures card ids up front, so it does not depend on the order of the card array.

## Changing the hidden tests

Change `MAX_SCORE` in `scripts/lib/common.mjs` together with the tests, then run
`bash scripts/rescore.sh` so that every finished run is judged by the same tests (the workspaces are kept
for this reason). Only test behaviour that the task description specifies, otherwise a failure is not the
agent's fault. Verify new tests against `reference/` first.

## Troubleshooting

- **A run scores 0 UI tests:** read `results/<run>/ui.log`. Typical causes: dev server did not start, port busy.
- **`team` stalls:** headless runs cannot answer permission prompts. Set
  `BENCH_CLAUDE_FLAGS=--dangerously-skip-permissions` in an isolated environment.
- **A run was not scored:** re-run `bash scripts/score.sh workspaces/<run> results/<run>` and then
  `node scripts/aggregate.mjs`.
- **Windows:** scripts need Git Bash; `.gitattributes` keeps `*.sh` on LF line endings.
