# Scoring rubric and analysis plan (pre-registered)

Written before any V3 run and before seeing any solution. It must not be changed after the first run;
if a change turns out to be necessary, it is recorded in `prereg/amendments.md` with date and reason,
and results are reported with both the original and the amended rubric.

## 1. Primary outcome: quality score per run (0 to 50)

Every issue is scored on its own, 0 to 10 points, by the criteria below. A run's quality score is the sum
over the five issues. The ground truth for triage is `ground-truth.md`.

| Criterion | Points | Full points when | Zero when |
|---|---|---|---|
| **Triage** | 2 | the status in BACKLOG.md matches the ground truth, with evidence from the code | status wrong or not stated |
| **Correctness** | 3 | every acceptance scenario of the issue passes (`acceptance-scenarios.md`), no regression | the change does not work or breaks something |
| **Completeness and scope** | 1 | covers what the issue and the maintainers' comments ask for, no unrelated changes | major part missing, or large unrelated changes |
| **Design and conventions** | 2 | fits OrchardCore patterns, backward compatible, safe (see notes per issue) | breaking change, security problem, or clearly against conventions |
| **Tests** | 1 | meaningful tests that pass and fail without the change | no tests, or tests that do not exercise the change |
| **Documentation** | 1 | release notes and BACKLOG.md explain the change accurately | missing or wrong |

Half points are allowed. Correctness is split by scenarios: 3 × (passing scenarios / scenarios of the issue),
rounded to halves, and 0 if the change introduces a regression in the full test suite.

**An issue that was correctly left alone** (status "resolved" or "not worth doing" in the ground truth,
or a justified decision for the open points of #18455): Triage as above; Correctness, Completeness and
Design get full points if the justification is accurate and sound; Tests 1 if no test was needed;
Documentation 1 if BACKLOG.md explains it. An unjustified skip of an open issue scores only Triage.

### Notes per issue

- **#18455:** Triage requires recognising that points 1 and 4 are resolved and 2 and 3 open. Implementing
  2 and 3 must keep existing registrations working (backward compatible). Leaving them with a justification
  that cites the maintainers' request for separate issues is equally valid.
- **#14197:** The default behaviour of existing sites should not change without a setting (or the change
  must be clearly harmless). Both the tags editor and the tags display are in scope.
- **#10539:** `IDeploymentSource` must not get a new member that breaks existing implementations (a default
  interface method or a separate interface is fine). Failure handling must be defined.
- **#10285:** The delete step must be idempotent (deleting a missing item is not an error) and respect
  permissions on import as the existing content step does.
- **#9662:** Must be optional (off by default or behind a permission) and must never render a password or
  a full connection string.

## 2. Secondary outcomes

Measured automatically for every run, reported next to the quality score:

- build of `test/OrchardCore.Tests` succeeds (yes/no)
- regressions: tests that pass on the base commit and fail after the run
- the agent's own tests: number, passing, and number that fail on the base commit
- acceptance scenarios passed (of all scenarios in `acceptance-scenarios.md`)
- triage accuracy: issues (and #18455 points) with the correct status, 0 to 8
- one commit per issue, `BACKLOG.md` present
- wall-clock time, tokens (input+output, all incl. cache), estimated cost (list price), validity

## 3. How the quality score is assigned

1. **Acceptance tests** are written after all runs, strictly from `acceptance-scenarios.md`, at the level of
   behaviour (HTTP, recipes, rendered pages, public services), not against the internal API of one solution.
   A scenario that cannot be expressed without depending on a particular API design is scored by review only.
2. **Blind review.** Per issue, the diff of each run (its `#<n>:` commit, plus BACKLOG.md section) is
   anonymized (run id replaced by a random code, mode not mentioned) and shuffled. A judge model
   (`claude-opus-5-5`) scores it with this rubric. Every diff is scored twice in independent sessions with
   different orders. Where the two scores differ by more than 2 points, a third pass decides (median).
3. **Human check.** The repository owner reviews, still blind, the diffs with the largest disagreement and a
   random sample of at least 1 diff per issue. If the human score differs from the model score by more than
   2 points, the human score wins and the case is listed in the report.
4. Scores are de-anonymized only after all scoring is finished.

## 4. Analysis plan

- Design: 3 modes × 3 runs (pilot), same model, base commit and prompts; mode order rotates per round.
- Invalid runs (the CLI never reached the model, account limits) are repeated and excluded.
- Report per mode: mean ± sample standard deviation and the individual values, for the quality score, every
  secondary outcome, and the quality score per issue.
- With n = 3 no significance tests are claimed. A difference between two modes is called **notable** only if
  the difference of the means exceeds the larger of the two standard deviations **and** points the same way
  in at least 3 of the 5 issues. Everything else is reported as "no clear difference".
- Efficiency is reported as quality per hour and quality per dollar, next to (never instead of) the raw values.
- If a mode is notably better on quality, the batch may be extended to 5 runs per mode before conclusions
  are drawn; this decision is made on the pilot results without looking at individual diffs again.
