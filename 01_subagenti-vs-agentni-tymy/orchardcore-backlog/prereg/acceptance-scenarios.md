# Acceptance scenarios (pre-registered)

Behaviour that a correct solution must show. After all runs these scenarios are turned into tests that
exercise behaviour (HTTP requests, recipes, rendered pages, public services), run against every workspace
on SQLite. Where a scenario needs a setting or extension point whose name differs between solutions, the
test is given a small adapter per run (documented in the results); the expected behaviour stays the same.
Scenarios marked *(review)* are judged in the blind review only.

## #18455 Refactor DI / interfaces (open points 2 and 3)

Only for runs that implemented the points; a justified skip is scored by review.

- **S1.** A site can run Media without `MediaTokenSettingsUpdater` touching the media token settings
  (by disabling a feature or replacing the registration), while resized image tokens still work.
- **S2.** With default configuration, media token behaviour is unchanged (existing tests pass).
- **S3.** The Lucene admin, recipe step, search and content picker work when the index manager is resolved
  through its abstraction; a replacement registration of the abstraction is used by those consumers.
- **S4.** *(review)* Existing public constructors and registrations keep working (no breaking change).

## #14197 Taxonomy picker display text

Setup: a taxonomy with terms `Computers > New`, `Computers > Used`, `Phones > New`, `Phones > Used`, a
content type with a taxonomy field using the tags editor, the new option enabled.

- **S1.** The tags editor data for the field lets the user tell both `New` terms apart (the path or the parent
  is part of the text offered for each term).
- **S2.** The tags display of a content item with `Phones > New` selected shows it distinguishable from
  `Computers > New`.
- **S3.** With default settings, an existing site renders the editor and display as before.
- **S4.** Selecting and saving terms still stores the same term content item ids.

## #10539 Deploy: success callback

- **S1.** After a successful export to a remote instance, a registered callback/handler receives the
  deployment plan (or its steps) and the exported content item ids.
- **S2.** When the remote instance rejects the package (non-success status), the success callback is not
  invoked and the failure is observable to the handler or reported with the target's error message.
- **S3.** Existing `IDeploymentSource` implementations compile and run unchanged.
- **S4.** *(review)* The design is usable for the issue's use case: removing a "deploy" tag only after success.

## #10285 Deploy: Delete Content Items step

- **S1.** A deployment plan with the new step produces a recipe step that identifies content items to delete.
- **S2.** Executing that recipe step on a target site removes the listed content items (not visible as
  published or latest any more).
- **S3.** Executing the same step twice, or with ids that do not exist, completes without error.
- **S4.** The step is available in the deployment plan editor (it has a display driver and can be added).
- **S5.** *(review)* Import respects permissions like the existing content recipe step.

## #9662 Show current DB connection in admin

- **S1.** With the feature/option enabled, an admin page of the running tenant shows the database provider
  and the database name or server.
- **S2.** The rendered page never contains the password or the full connection string.
- **S3.** With default configuration nothing new is shown (opt-in), or access requires a dedicated permission.
- **S4.** Works for the default tenant and for another tenant.
