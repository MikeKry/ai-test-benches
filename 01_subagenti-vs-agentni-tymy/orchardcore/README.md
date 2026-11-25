# Subagents vs. agent teams in Claude Code: OrchardCore benchmark (V2)

The same real-world task is given to three ways of working in Claude Code, in a clone of
[OrchardCore](https://github.com/OrchardCMS/OrchardCore), and the result is compared on
**quality, time and token usage**:

| Mode | Description |
|---|---|
| `single` | one session does everything sequentially (subagent tools are disabled) |
| `subagents` | the main session delegates to role-based subagents |
| `team` | an experimental agent team with a lead, teammates, shared task list and messaging |

The task (`prompts/task.md`) finishes OrchardCore issue
[#14810](https://github.com/OrchardCMS/OrchardCore/issues/14810), "Culture is case sensitive" on PostgreSQL:
case-insensitive culture filters in GraphQL, a migration that lower-cases existing index records,
a case-insensitive content culture picker, tests and release notes. The parts touch different modules and
can be worked on in parallel, which is where teams are expected to have an advantage.
The small-project counterpart of this benchmark is `../mini-kanban`.

## Requirements

- Claude Code CLI (`claude`) on `PATH`, or set `CLAUDE_BIN`. Agent teams need version 2.1.32 or newer.
- .NET SDK 11 (see `upstream/global.json`), Node.js 20+, git, bash (on Windows: Git Bash).
- Docker for the PostgreSQL pass of the hidden tests (optional; without it only SQLite is scored).
- About 3 GB of disk per run (the workspaces are kept for re-scoring).
- Runs spend tokens and time: a run takes 30 to 90 minutes plus about 25 minutes of scoring.

## Setup

```bash
git clone https://github.com/OrchardCMS/OrchardCore.git upstream
cp config.env.example config.env      # optional, defaults work
bash scripts/baseline.sh              # once: scores the unmodified base commit (about 20 minutes)
bash scripts/run.sh single 1          # one real run
bash scripts/run-all.sh 3             # 3 runs per mode, interleaved
node scripts/aggregate.mjs            # re-create the summary any time
```

Every run starts from a fresh clone of the pinned base commit (`BENCH_BASE_COMMIT`) on branch `bench`.
`run-all.sh` skips finished runs and repeats invalid or interrupted ones.

## How a run is scored

`scripts/score.sh` runs after the agent has finished:

1. **Build** of `test/OrchardCore.Tests` with the agent's change.
2. **Hidden tests** (`hidden-tests/BenchHidden`, 19 cases) are copied into the test project only now and run
   twice: on SQLite and on PostgreSQL in a throw-away Docker container. The bug of the issue shows mainly
   on PostgreSQL; on SQLite several comparisons are case-insensitive anyway.
3. **Regressions:** the rest of `OrchardCore.Tests` (about 5,900 tests, including the agent's own). A test
   counts as a regression only if it passed on the base commit (`baseline/regression.xml`).
4. **Do the agent's tests catch the bug?** Only the agent's changes under `test/` are applied to the base
   commit and run there. Tests that fail without the fix prove that they test the fix.

On the unmodified base commit 6 of 19 hidden tests fail on SQLite and 14 of 19 on PostgreSQL.
The reference solution in `reference/fix.patch` passes all 38.

| Output in `results/<mode>_<n>/` | Content |
|---|---|
| `metrics.env` | mode, model, CLI version, base commit, duration, claude exit code, agent commits |
| `session.json`, `stderr.txt` | raw `claude -p --output-format json` result and stderr |
| `changes.patch`, `changes.stat` | everything the agent changed, committed or not |
| `score.json`, `score.txt` | e.g. `hidden=38/38 (sqlite 19, postgres 19) regressions=0 agent_tests=7/7 catch_bug=5 build=ok` |
| `*.xml`, `*.log` | xUnit results and logs of every scoring step |

## Measurement notes

The invalid-run rule, token accounting (`modelUsage`, includes subagents and teammates) and cost
estimates work as in `../mini-kanban`; see its README. `num_turns` counts the main session only and is not
comparable across modes.

## Changing the hidden tests

Edit `hidden-tests/BenchHidden`, update `HIDDEN_TESTS` in `scripts/lib/common.mjs`, verify the tests against
`reference/fix.patch` (all must pass) and against the base commit (`scripts/baseline.sh`), then run
`bash scripts/rescore.sh` so that every finished run is judged by the same tests.
