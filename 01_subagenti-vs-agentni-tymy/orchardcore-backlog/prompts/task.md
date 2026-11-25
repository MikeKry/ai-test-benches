# Task: work through a backlog of five OrchardCore issues

You are working in a clone of the OrchardCore repository (current directory). Work fully autonomously,
do not ask questions. Read `AGENTS.md` first; it explains how to build and test.

## Backlog

- https://github.com/OrchardCMS/OrchardCore/issues/18455 - Refactor DI / interfaces
- https://github.com/OrchardCMS/OrchardCore/issues/14197 - Extend taxonomy picker display text
- https://github.com/OrchardCMS/OrchardCore/issues/10539 - Deploy: add success callback to IDeploymentSource
- https://github.com/OrchardCMS/OrchardCore/issues/10285 - Deploy: Delete Content Items step
- https://github.com/OrchardCMS/OrchardCore/issues/9662 - Show current DB connection in admin

The full text of each issue with its comments is in the issue snapshot below; you do not need network
access to read them. Some may already be fully or partly resolved in this code base, or no longer make
sense. Finding that out is part of the task.

## For each issue

1. **Triage.** Determine the current status in this code base: resolved, partly resolved, open, or not
   worth doing. Base it on the code, not only on the issue.
2. **Implement** what is still needed, the way a maintainer would accept it as a pull request: follow the
   conventions of the surrounding code (features, drivers, settings, migrations, dependency injection),
   keep public APIs backward compatible, and take the maintainers' comments in the issue into account.
3. **Test.** Add automated tests to the existing test projects (`test/`) that fail without your change.
4. **Document** user-visible changes in the release notes of the upcoming version under `src/docs/releases/`.
5. **Commit** each issue separately, message starting with `#<issue number>:`.

Then write `BACKLOG.md` in the repository root: one section per issue with the status you found, what you
changed (or why you changed nothing), and anything a reviewer should know. Commit it as well.

## Rules

- Build and test economically: while working, build only the projects you change
  (for example `dotnet build src/OrchardCore.Modules/OrchardCore.Taxonomies`). Run the full build of
  `test/OrchardCore.Tests/OrchardCore.Tests.csproj` and its tests once all issues are done.
- Do not weaken or delete existing tests. The full test suite must pass at the end.
- Do not push anything and do not open pull requests. Do not look for or create a `hidden-tests/` directory.
