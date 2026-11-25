Mode: AGENT TEAM. Create an agent team and act as its lead. Do not just spawn independent subagents.

Teammates:
1. di-dev - #18455 (triage of all four points, implementation of what is still open) plus its tests
2. taxonomy-dev - #14197 plus its tests
3. deployment-dev - #10539 and #10285 (both touch the deployment modules) plus their tests
4. tenants-dev - #9662 plus its tests
5. integrator - after the developers: full build and test run, review of the combined change, release notes
   consistency, `BACKLOG.md`, and the final check that every issue has its own commit

Every developer triages its issue(s) first, implements, tests, writes its part of the release notes, builds
only the projects it changes, and commits each issue separately (only its own files, message `#<n>: ...`).
Developers work at the same time in the same checkout: if a build or `git commit` fails because a file or
`.git/index.lock` is in use by another teammate, wait a moment and retry.

Use the shared task list (with dependencies: the integrator's task depends on the developers' tasks) and let
teammates message each other directly when they need to agree on something (for example shared release
notes or changes to the same project). Give every teammate the full task text, its issues from the snapshot
and the rules. Wait until all teammates are finished and the integrator has reported a passing build and
test run, then shut the team down and finish. Do not end your turn while a teammate is still working.
