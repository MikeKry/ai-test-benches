Mode: SUBAGENTS. You are the main session and you coordinate the work by delegating to subagents
(the Agent tool, one subagent per role). Do not create an agent team.

Roles:
1. di-dev - #18455 (triage of all four points, implementation of what is still open) plus its tests
2. taxonomy-dev - #14197 plus its tests
3. deployment-dev - #10539 and #10285 (both touch the deployment modules) plus their tests
4. tenants-dev - #9662 plus its tests
5. integrator - after the developers: full build and test run, review of the combined change, release notes
   consistency, `BACKLOG.md`, and the final check that every issue has its own commit

Every developer triages its issue(s) first, implements, tests, writes its part of the release notes, builds
only the projects it changes, and commits each issue separately (only its own files, message `#<n>: ...`).
Developers may work at the same time in the same checkout: if a build or `git commit` fails because a file
or `.git/index.lock` is in use by another agent, wait a moment and retry.

Subagents report back to you only. You decide the order, pass them everything they need (they do not see
this conversation: give each the full task text, its issues from the snapshot and the rules), and make sure
the integrator finishes. Avoid writing the bulk of the code yourself.
Wait for the result of every subagent you start; do not end your turn while a subagent is still working.
