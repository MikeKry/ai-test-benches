# Benchmark V3: OrchardCore backlog

Compares three Claude Code modes (single session, subagents, agent team) on a backlog of five real
OrchardCore issues: #18455, #14197, #10539, #10285, #9662. Unlike V2 (`../orchardcore/`), the agent has to
find out the status of every issue itself, some are partly resolved, and the issues touch independent
modules, so delegation has a real chance to pay off.

**Results of the pilot: [`results/REPORT.md`](results/REPORT.md).**

## Pre-registration

Everything that defines the measurement was written and committed before the first run
(commit `21ee3ac`, hashes in `prereg/MANIFEST.sha256`):

- `prereg/ground-truth.md`: the true status of each issue at the base commit
- `prereg/rubric.md`: quality score 0 to 50 (0 to 10 per issue), secondary outcomes, analysis plan
- `prereg/acceptance-scenarios.md`: behaviour the acceptance tests check after the runs
- `prompts/task.md`, `prompts/issues.md`: the task and a snapshot of the issues with their comments

Changes after the first run go to `prereg/amendments.md` (see the rubric).

## Layout

| Path | Content |
|---|---|
| `prompts/` | task, issue snapshot, one prompt per mode (prepended to the task) |
| `scripts/` | harness, adapted from V2 (see below) |
| `baseline/` | test results of the unchanged base commit |
| `results/<mode>_<n>/` | per run: `metrics.env`, `session.json`, `changes.patch`, `commits/` (one patch per commit), test XML, `score.json` |
| `workspaces/` | the OrchardCore clone of each run (git-ignored, kept for the acceptance tests and the review) |

## Running

Needs .NET SDK 11.0.100, Node, Git Bash and the OrchardCore clone of V2 (`../orchardcore/upstream`, override
with `BENCH_UPSTREAM`). No Docker. Runs are sequential; mode order rotates per round.

```bash
bash scripts/baseline.sh      # once, about 15 minutes
bash scripts/run-all.sh 3     # pilot: 3 runs per mode
```

`run-all.sh` keeps Windows awake while it runs, but on Modern Standby laptops set the screen and sleep
timeouts on AC power to "never" for the duration of a batch (see `../orchardcore/results/NOTES.md`).

## What is measured automatically

`scripts/score.sh` after each run, in `score.json`: build of the scored test projects
(`OrchardCore.Tests`, `OrchardCore.Abstractions.Tests`), regressions against the baseline, the agent's own
tests and how many of them fail on the base commit, commits per issue (`#<n>:`), `BACKLOG.md`, release notes,
test files outside the scored projects. Time, tokens and cost come from `session.json`.

The quality score is assigned after all runs: acceptance tests from `prereg/acceptance-scenarios.md` and a
blind review of the per-issue commits, as described in `prereg/rubric.md`.

## Differences from V2

- prompt = mode prompt + `task.md` + `issues.md`; no hidden tests, no PostgreSQL pass
- turn limit 800 and timeout 4 h (five issues instead of one)
- roles in subagents/team: one developer per area (deployment issues #10539 and #10285 together) and an
  integrator for the full build, tests and `BACKLOG.md`; same build policy in every mode (build only the
  changed projects while working, full build and tests once at the end)
