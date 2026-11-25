# Task: culture values must be case-insensitive (OrchardCore issue #14810)

You are working in a clone of the OrchardCore repository (current directory). Work fully autonomously,
do not ask questions. Read `AGENTS.md` first; it explains how to build and test.

## Background

GitHub issue #14810 "Postgre: Culture is case sensitive": after moving a site from SQLite to PostgreSQL,
culture codes became case sensitive. Filtering content by `en-GB` finds nothing, only `en-gb` works.

The maintainers decided: culture codes in `LocalizedContentItemIndex.Culture` are stored normalized
(lower case, `ToLowerInvariant()`), every query against that column must normalize its input the same
way, and existing records must be converted by a migration. Part of this is already done on `main`
(the index provider stores lower case, the contents admin filter and `IContentLocalizationManager`
normalize their input). The rest is your job.

## Requirements

1. **GraphQL.** Filtering content items by culture through the `where` argument must ignore case for every
   comparison GraphQL offers on that field, for example:
   `blogPost(where: { localization: { culture: "en-GB" } })`, `culture_not`, `culture_in`,
   `culture_not_in`, `culture_contains`, `culture_starts_with`, `culture_ends_with` (and their `not_` variants).
   `en-GB`, `EN-GB` and `en-gb` must give the same result on every database provider (SQLite, PostgreSQL,
   SQL Server, MySQL). Other index properties keep their current behaviour.
2. **Migration.** Add a migration step to `OrchardCore.ContentLocalization` (`Migrations.cs`) that converts
   all existing `LocalizedContentItemIndex.Culture` values to lower case. Records with a `null` culture stay
   `null`; no other column changes. It must work on all supported database providers and on sites with many
   records. New sites must end up at the same final migration version.
3. **Content culture picker.** `ContentCulturePickerController.RedirectToLocalizedContent` must accept
   `targetCulture` in any case (`en-gb`, `EN-GB`) when the culture is supported, and behave exactly as for
   the canonical spelling.
4. **Tests.** Add automated tests for each requirement to the existing test projects (`test/`). They must pass
   with your change and at least one of them must fail without it. Do not weaken or delete existing tests.
5. **Docs.** Describe the change (including the migration) in the release notes of the upcoming version
   under `src/docs/releases/`.

## Definition of done

- `dotnet build` of `test/OrchardCore.Tests/OrchardCore.Tests.csproj` succeeds without new warnings.
- `dotnet test` of `test/OrchardCore.Tests` passes, including your new tests.
- Public APIs stay backward compatible (no removed or renamed public members).
- Commit your work to the current branch with a meaningful message when you are done.

Do not look for or create a `hidden-tests/` directory and do not push anything.
