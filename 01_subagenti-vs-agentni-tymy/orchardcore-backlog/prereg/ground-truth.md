# Ground truth: status of the five issues at the base commit

Pre-registered before any V3 run. Base commit: OrchardCore `main` at
`c5583e57dc675b9581231bbb6c4e8bd1ed91c845` (2026-11-15). Paths are relative to the repository root.
Issue texts and comments were read on 2026-11-16.

| Issue | GitHub state | Status in the code | Expected outcome of a good run |
|---|---|---|---|
| #18455 Refactor DI / interfaces | closed (stale, needs author feedback) | 2 of 4 points resolved, 2 open | recognise what is resolved; handle the 2 open points or justify not doing so |
| #14197 Taxonomy picker display text | open | open | implement |
| #10539 Deploy: success callback | open | open | implement (design decision) |
| #10285 Deploy: Delete Content Items step | open | open | implement |
| #9662 Show current DB connection in admin | open | partially resolved | build on what exists, keep it optional and safe |

## #18455 Refactor DI / interfaces

The issue bundles four points. A maintainer asked to split them into separate issues (2025-10-16);
the issue was then closed as stale.

1. **`ILocalizationService.GetAllCulturesAndAliases` is static.** Resolved. It is an instance member of
   the interface (`src/OrchardCore/OrchardCore.Abstractions/Localization/ILocalizationService.cs:23`)
   with implementations in `DefaultLocalizationService` and `OrchardCore.Localization/Services/LocalizationService.cs:64`.
2. **`MediaTokenSettingsUpdater` cannot be disabled or replaced.** Open. Still registered in the main
   `OrchardCore.Media` startup (`src/OrchardCore.Modules/OrchardCore.Media/Startup.cs:183-194`), with
   `IFeatureEventHandler` and `IModularTenantEvents` registered through lambdas that resolve the concrete
   type. Not a separate feature.
3. **`LuceneIndexManager` is consumed by its concrete type.** Open. Registered via
   `AddIndexingSource<LuceneIndexManager, LuceneIndexManager, ...>` and injected as the concrete type in
   `OrchardCore.Lucene.Core/Services/LuceneSearchService.cs`, `OrchardCore.Lucene/Controllers/AdminController.cs`,
   `OrchardCore.Lucene/Recipes/LuceneIndexStep.cs`, `OrchardCore.Lucene/Services/LuceneContentPickerResultProvider.cs`
   and `OrchardCore.Lucene/DataMigrations/IndexingMigrations.cs:86`.
4. **`LuceneSearchService` is consumed by its concrete type.** Resolved. Registered with
   `AddSearchService<LuceneSearchService>(...)` (`OrchardCore.Lucene/Startup.cs:109`); no consumer injects
   the concrete type.

Acceptable outcomes: implement points 2 and 3 in a backward-compatible way (one commit each), or
deliberately leave them with a clear justification (closed issue, maintainers asked for separate issues).
Required in both cases: state that points 1 and 4 are already resolved.

## #14197 Extend taxonomy picker display text

Open. The tags editor sends only the term's own display text to the client
(`OrchardCore.Taxonomies/ViewModels/EditTagTaxonomyFieldViewModel.cs:28-32`, `TagTermEntry.DisplayText`;
`Views/TaxonomyField-Tags.Edit.cshtml:52`). Terms with the same name in different branches cannot be told
apart in the tags editor or in the tags display. The standard editor already shows the tree (`Level`).
A maintainer suggested an approach like PR #8280 or a custom editor.

## #10539 Deploy: add success callback to IDeploymentSource

Open. `IDeploymentSource` has only `ProcessDeploymentStepAsync`
(`src/OrchardCore/OrchardCore.Deployment.Abstractions/IDeploymentSource.cs`). The remote export
(`OrchardCore.Deployment.Remote/Controllers/ExportRemoteInstanceController.cs:112-118`) checks the status
code and shows a notification, nothing else is informed. Changing `IDeploymentSource` itself would break
every implementation; a backward-compatible extension point is expected.

## #10285 Deploy: Delete Content Items step

Open. There is a `DeleteContentDefinition` deployment step (`OrchardCore.ContentTypes/Deployment`) but no
step that deletes content items, and the `Content` recipe step (`OrchardCore.Contents/Recipes/ContentStep.cs`)
does not delete. A maintainer proposed a delete-content step (idempotent) and optionally exporting changes
since a date, including deletions from the content item index.

## #9662 Show current DB connection in admin

Partially resolved. With the Tenants feature on the default tenant, the tenant list shows the database
provider as a badge (`OrchardCore.Tenants/Views/ShellSettingsEntry.Database.SummaryAdmin.cshtml`) and the
tenant editor shows the connection string with the password redacted
(`Views/Shared/_TenantDatabaseInfo.cshtml`, `TenantConnectionStringRedactor`). There is no place where a
tenant (including the default one) shows the database it is connected to (provider, server, database
name). A maintainer asked that this must be optional and must not expose the connection string.
