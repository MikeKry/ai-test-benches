# Driver notes: end-of-run detection (2026-11-22)

## Problem
Until 2026-11-22 ~03:30 the driver ended a session when the lead's last message was a finished turn and no
transcript had changed for 180 s. Background tasks (Bash `run_in_background`, e.g. a full `dotnet test`)
write to `%TEMP%/claude/<hash>/<session>/tasks/*.output`, not to the transcripts, so a test run longer than
3 minutes looked like silence. `check-cutoff.mjs` found:

| Run | Finding | Decision |
|---|---|---|
| V2 team #2, #3, #4, #5 | test runs still going at the cut (exit -1, no trailer); V2 #2/#3 had a task notification queued for the lead | invalid, rerun |
| V3 team #2 | test run still going, notification queued | invalid, rerun |
| V2 team #1 | all tasks finished 187 s before the end; teammates were waiting for notifications that never woke them within 3 min | valid (the fixed driver would end it at the same point) |
| V1 #1, #14; V3 #1, #3 | the only "running" tasks were ones the agents had killed (`[killed]`) | valid |
| V1 #15 | a denied prompt interrupted the lead's turn (`[Request interrupted by user for tool use]`), so the lead never had an end_turn and the run idled to the 3600 s limit; active work ended at 373 s | valid; use active time |

The invalid results are kept in `<bench>/results-interactive/invalid/`.

## Fix
The session now ends only when, in addition to the lead having finished:
- no transcript **and no background task output** changed for `--quiet-s`;
- no background task is still running (output without `[exited with code N]` / `[killed]` trailer), except
  an idle server that printed a ready line, or a task unchanged for 30 min (hung; the time limit applies);
- no task notification is queued for the lead after its last message;
- a lead turn interrupted by a denied prompt counts as finished (fixes the V1 #15 idle hour).

## Second correction (2026-11-22 ~10:00)
The rule "no task notification queued for the lead" was wrong: an idle lead of an interactive team session
does not pick up a queued `<task-notification>` by itself (it stays `enqueue` without `dequeue`). Reruns
V2 #3 and #4 therefore idled to the 7200 s limit after the last activity at 1312 s and 2412 s. Nothing
changed in the workspace after that, so their scores and costs stand; their time is the active time. The
rule was removed; undelivered notifications are recorded in `interactive.json` as `stuckNotifications`.
This is an observation about agent teams themselves: a teammate's background test result can reach an idle
lead without waking it, so a run can stall until a human nudges it.

## Time metric
Wall time contains the 180 s quiet wait. Comparable to the `-p` runs is the **active time**: last
transcript entry minus run start (`active-time.mjs`).
