# Amendments after the first run

Changes to the harness or the protocol made after the first V3 run, as required by `rubric.md`.
The rubric, ground truth, acceptance scenarios and task prompt are unchanged.

## A1 (2026-11-18): PowerShell and Monitor tools allowed

**What happened.** The pilot started with the V2 tool allowlist (`--allowedTools Bash,Edit,Write,...`).
On Windows, Claude Code also offers the `PowerShell` and `Monitor` tools; in a headless run a tool outside
the allowlist is denied. Refused calls per run (counted from the transcripts):

| Run | Refused calls | Effect |
|---|---|---|
| single_1 | 0 | none |
| subagents_1 | 5 (Monitor, PowerShell) | the subagents fell back to Bash and finished (5/5 issues committed) |
| subagents_2 | 0 | none |
| team_1 | 3 (PowerShell build, Bash heredoc with `cd`) | deployment-dev stopped; the lead ended the run after 15 min with #10285 not started, #10539 uncommitted, no final build and no BACKLOG.md |

**Change.** `PowerShell`, `Monitor`, `TaskOutput` and `TaskStop` were added to the allowlist
(`scripts/lib/common.sh`). Nothing else changed.

**Handling of the affected runs.**
- team_1 is set aside in `results/_harness_affected/team_1` and repeated: its outcome was decided by the
  refused calls, not by the mode. It is reported separately and excluded from the comparison.
- subagents_1 is kept (it completed the whole task); it is marked in the report, and the comparison is also
  shown without it.
- single_1 and subagents_2 had no refused calls and are kept.

## Note (2026-11-18): account spend limit

After four runs the account reached its spend limit (11:05 UTC). The runs started after that point
(single_2, single_3, subagents_3, team_2 after 7 minutes, team_3) are invalid by the existing rule
(account error) and are repeated; this is not a change of the protocol.

## A2 (2026-11-21): team mode rerun as a real agent team

**What happened.** All runs used `claude -p`. Per the Claude Code docs
(https://code.claude.com/docs/en/agent-teams), in non-interactive mode Claude does not spawn teammates and a
named agent runs as an ordinary subagent. The transcripts confirm it: in the original team runs the lead
started named agents, kept a task list and the agents used `SendMessage`, but no teammate message ever reached
the lead and one agent reported that `TaskUpdate` was not available to it. The original "team" runs measured
named subagents with peer messaging, not agent teams.

**Change.** Team mode is run again (3 runs) in an interactive session, driven by
`../tools/interactive-run/run-interactive.mjs` (Microsoft `node-pty` 1.1.0, pinned) with
`BENCH_INTERACTIVE_TEAM=1`, into `results-interactive/` and `workspaces-interactive/`. Everything else is
unchanged: model, prompts, allowlist and permission mode, time limit, environment, scoring. Differences that
follow from the interactive mode:

- The driver answers only known first-run screens (theme, security notes, trust of the fresh workspace,
  "Not now" to the fullscreen renderer), pastes the prompt and submits it.
- Permission prompts are denied, as `-p` does for tools outside the allowlist; every denial is logged
  (`interactive.json`).
- `--max-turns` is print-only, so only the time limit applies.
- The session ends when the lead's last message is a finished turn and no transcript (lead or teammates)
  has changed for 180 s; that quiet period is included in the wall-clock time.
- Tokens and cost are computed from the transcripts with the list prices fitted exactly to the `costUSD` of
  69 earlier runs (Sonnet 5.5: $2 input, $10 output, $0.10 cache read, $2.50 / $4 cache write 5 min / 1 h
  per million tokens); recomputing two earlier runs from their transcripts reproduces their cost to the cent.

**Handling.** The original team runs stay in `results/` and are reported as a separate variant ("named
subagents"). The quality scoring of the new runs follows the same rubric: acceptance tests, two blind judge
passes and a human check of the largest disagreements.

The V1 pilot of the driver (2026-11-21, mini-kanban team run 1) reached real teammates: 4 named teammates,
15 teammate messages delivered to the lead (0 in the original runs), 54/54 hidden tests.

### A2 outcome (2026-11-22)

- All 23 team runs (V1 15, V2 5, V3 3) are valid. Runs that hit the account spend limit and five runs the first
  driver version cut off during background test runs were repeated; the originals are in
  `results-interactive/invalid/`. Driver fixes: `tools/interactive-run/NOTES-driver.md`.
- Scoring: the three V3 runs got the acceptance tests (adapters in `acceptance/adapters-interactive/`) and a
  second blind review round of all 12 runs (`results/review2/`, `results/quality-review2.md`), so that the new
  solutions are judged next to the old ones. The six human scores of round 1 were re-applied by run and issue
  under the same > 2 point rule.
- **Deviation:** the new solutions had no human check of their own. In round 2 the two passes differed by at
  most 1.5 points on any solution, so no solution required it; the human sample of round 1 was not extended.
- Time of the interactive runs is reported as active time (last transcript entry minus start), because wall time
  contains the driver's quiet wait.
