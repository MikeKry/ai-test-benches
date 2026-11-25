# Issue snapshot

Issue texts and comments as of 2026-11-16 (automated bot comments omitted).

---

## #18455: Refactor DI / interfaces

State: closed. Opened 2025-10-10. Labels: bug :bug:, stale, needs author feedback.

During the implementation, I came across several things in the OC codebase that I’m not sure how to split into separate issues:

**ILocalizationService.cs** – This interface contains a static method GetAllCulturesAndAliases that manages the culture list. I believe this logic would be better placed in the implementation, so it can be configured (e.g., for adding new cultures).

**MediaTokenSettingsUpdater** – In some cases, we need to provide a single resizer token for a longer application lifetime. It would be helpful to move this service into a separate feature, so we can disable it and supply our own HashKey.
Additionally, it’s currently impossible to unregister this service, since it’s registered via a lambda for handlers:
services.AddScoped<IFeatureEventHandler>(sp => sp.GetRequiredService<MediaTokenSettingsUpdater>());

**LuceneIndexManager** – Although this class implements IIndexManager, it’s registered and used in code by its concrete type. This makes it impossible to replace without modifying all related features or performing runtime rerouting.

**LuceneSearchService** – The same issue applies here as with the index manager.

### Comment by hishamco, 2025-10-12

Let me revise the `ILocalizationService` because I'm the one who did it :)

### Comment by hishamco, 2025-10-12

After a quick look, I will propose a new PR for refactoring this to allow people to participate in adding culture aliases

### Comment by hishamco, 2025-10-12

@MikeKry can you submit PR to fix some of those?

### Comment by sebastienros, 2025-10-16

@MikeKry would you mind creating distinct issues so we can track them individually?

---

## #14197: Extend taxonomy pickerdisplay text

State: open. Opened 2023-08-24. Labels: none.

### Is your feature request related to a problem? Please describe.
When taxonomy field is used for selection from bigger taxonomy, it can happen that two taxonomy terms have same name. Currently there is no way for customizing this display text at tag level.

For example - you could have taxonomy for product categories
Computers
- New
- Used

Phones
- New
- Used

Then in picker you have 2x New and 2x Used. It can be in many cases solved by correct content filling, but there are cases when it is needed.

### Describe the solution you'd like

Possibility to customize display text of taxonomy item in selectors and summarry views. Something as in #8280

Possibly just visualize somehow taxonomy tree in tags and select editors?
In filter and taxonomy part, this is solved by showing a tree sturcture.

### Describe alternatives you've considered
Currently I have overriden editor view and I include previous taxonomy levels in their display text, but that makes updates of CMS a lot more complicated.

![image](https://github.com/OrchardCMS/OrchardCore/assets/52829889/9de1b2b6-c123-4c05-85c6-2e7a9bf54c93)
or with chevron
![image](https://github.com/OrchardCMS/OrchardCore/assets/52829889/bd9c2062-89eb-4f81-bf3c-cab7a56cdc5c)

![image](https://github.com/OrchardCMS/OrchardCore/assets/52829889/3b8fb0ba-1722-4a44-993c-3293338ad532)

### Comment by sebastienros, 2023-08-24

I believe something like https://github.com/OrchardCMS/OrchardCore/pull/8280 would be nice. Another option is to provide a custom "Editor" for this field.

---

## #10539: Deploy: Add success callback to IDeploymentSource 

State: open. Opened 2021-10-22. Labels: Deployment.

### Is your feature request related to a problem? Please describe.
Issue/enhancement is related to ticket #10233 . I am trying to make deployment process easy to use for end user. 

*related to remote deployment*

We are using "deploy to prod" tags on content items, then we use custom DeploymentSource to export only items with this tag AND we remove the tag.

But there is a problem - in case deployment fails - for example on duplicate alias or autoroutepath, then we have already removed tags but content items are not exported. 

### Describe the solution you'd like

I think it could be solved by adding callback method after successful response from target environment, method should also pass list of exported content item ids. 

I can imagine that this feature could have more usecases, for example it could also show detailed error message if deployment did not pass (to determine which alias is duplicate etc).

There is one problem and that is timeout from deployment target, callback would not be triggered on timeouts.. but that could be solved by applying batch size as mentioned here #10285

### Comment by sebastienros, 2021-10-28

We might already have a similar issue open that describes a solution.

---

## #10285: Deploy: Delete Content Items step

State: open. Opened 2021-09-16. Labels: none.

Extracted from #10233 

We need to be able to delete content items from production environment by deployment plan, like you can delete content type definitions.

Scenario:
* stage environment is used for all content changes
* production is maintained only by few users if needed
* all content is deployed from stage to production
* if you remove item on stage, you need to remove it from production also, but it is not possible check what has changed manually.

### Comment by sebastienros, 2021-09-16

I would suggest that we add an option to the `AllContentDeploymentStep` (for instance) that would accept a date, materialized with a time frame (last month, last week, custom days, ...) to upload all the changes of all the content items (or specific type for other steps) since this date. That would also include deletions since we have that in the content item index table.

Then also create a custom step for deleting a content item. And this Deployment Source would create either create or delete content steps. These actions are idempotent so we can re-run them multiple times without issues.

### Comment by MikeKry, 2021-09-23

I would also suggets to include Skip and Take parameters (skip could be handled in background), so user could choose batch size based on server capabilities - e.g. 50 items per export instead of all, because that could block server for a while

---

## #9662: Show current db connection in admin

State: open. Opened 2021-06-12. Labels: none.

### Is your feature request related to a problem? Please describe.
I changed database connection string for experiments, i would like to know if correct db is used.

### Describe the solution you'd like
In tenants or general settings, I would like to see database name / server, where current instance is connected.

### Comment by Piedone, 2021-06-24

You don't necessarily want to expose the DB connstring even to admins though (keep in mind that you can configure Orchard in a way that admins are able to create tenants without ever having to set the DB connection settings). So if added, this needs to be optional.
