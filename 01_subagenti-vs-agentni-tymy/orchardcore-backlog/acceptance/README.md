# Quality scoring (after all runs)

Implements section 3 of `prereg/rubric.md`. Written after the pilot, without changing the rubric or scenarios.

## Acceptance tests (`tests/`, `run.sh`)

Behaviour-level xUnit tests copied into each workspace's `OrchardCore.Tests` and run against the solution as
the agent left it. Names that differ between solutions come from `adapters/<run>.env`; write one per run
after reading the solution (template: `adapters/example.env`).

| Scenario | How it is checked |
|---|---|
| #10285 S1 | the deployment step (created through its factory) is processed by the registered sources and yields the recipe step with the ids |
| #10285 S2 | the recipe step posted to the remote import endpoint removes a published blog post (no published or latest version) |
| #10285 S3 | the same step posted twice, with an id that does not exist, succeeds |
| #10285 S4 | a step factory and a display driver for the step are registered |
| #10539 S3 | `IDeploymentSource` has no new abstract member; an implementation written against the base interface runs |
| #18455 S2 | the existing test suite (regressions = 0 in `score.json`) |

All other scenarios depend on how a solution names and places its setting, page or extension point
(e.g. #9662 is shown on the tenant list, the tenant edit page or the debugging settings depending on the run;
#10539 is a callback on the plan result in one run and a new interface in another). Following the rubric
("a scenario that cannot be expressed without depending on a particular API design is scored by review only"),
they are judged in the blind review.

## Blind review (`review/`)

- `build-packets.mjs 2`: per issue and pass one packet with the rubric, the issue, its ground truth, the
  scenarios and every run's `#<n>` commits plus its BACKLOG.md section, under a random code per issue,
  shuffled per pass, with words that could reveal the mode and commit hashes redacted. Key in
  `results/review/key.json`.
- `judge.sh`: one fresh `claude-opus-5-5` session per packet, no tools, outside the repository.
- `compute.mjs`: quality score per run and mode, the "notable" rule, quality per hour and per dollar.
