using OrchardCore.Autoroute.Models;
using OrchardCore.ContentLocalization.Models;
using OrchardCore.ContentManagement;
using OrchardCore.ContentManagement.Metadata;
using OrchardCore.ContentManagement.Metadata.Settings;
using OrchardCore.Lists.Models;
using OrchardCore.Title.Models;
using OrchardCore.Tests.Apis.Context;
using OrchardCore.Tests.Localization;

namespace OrchardCore.Tests.BenchHidden;

/// <summary>
/// A Blog tenant with content localization: three supported cultures and three localized blog posts.
/// The database provider comes from the environment (BENCH_DB_PROVIDER, BENCH_DB_CONNECTION), default SQLite.
/// </summary>
public class CultureCaseContext : BlogContext
{
    public static readonly string[] SupportedCultures = ["en-US", "en-GB", "fr-FR"];

    public string UsPostId { get; private set; }
    public string GbPostId { get; private set; }
    public string FrPostId { get; private set; }

    public CultureCaseContext()
    {
        var provider = System.Environment.GetEnvironmentVariable("BENCH_DB_PROVIDER");
        if (!string.IsNullOrEmpty(provider))
        {
            DatabaseProvider = provider;
            ConnectionString = System.Environment.GetEnvironmentVariable("BENCH_DB_CONNECTION");
        }
    }

    public override async Task InitializeAsync()
    {
        await base.InitializeAsync();

        await TenantLocalizationTestHelper.EnableLocalizationAsync(
            this,
            SupportedCultures,
            "OrchardCore.ContentLocalization",
            "OrchardCore.ContentLocalization.ContentCulturePicker");

        await UsingTenantScopeAsync(async scope =>
        {
            var definitions = scope.ServiceProvider.GetRequiredService<IContentDefinitionManager>();
            await definitions.AlterTypeDefinitionAsync("BlogPost", type => type.WithPart(nameof(LocalizationPart)));
        });

        // Cultures are written exactly as an editor would: the canonical spelling of the supported culture.
        UsPostId = await CreateLocalizedPostAsync("Culture post US", "/culture-post-us", "en-US", "set-one");
        GbPostId = await CreateLocalizedPostAsync("Culture post GB", "/culture-post-gb", "en-GB", "set-one");
        FrPostId = await CreateLocalizedPostAsync("Culture post FR", "/culture-post-fr", "fr-FR", "set-two");

        await WaitForDeferredTasksAsync(TestContext.Current.CancellationToken);
    }

    private async Task<string> CreateLocalizedPostAsync(string title, string path, string culture, string localizationSet)
    {
        string id = null;

        await UsingTenantScopeAsync(async scope =>
        {
            var contentManager = scope.ServiceProvider.GetRequiredService<IContentManager>();
            var item = await contentManager.NewAsync("BlogPost");
            item.DisplayText = title;
            item.Alter<TitlePart>(part => part.Title = title);
            item.Alter<AutoroutePart>(part => part.Path = path);
            item.Alter<ContainedPart>(part => part.ListContentItemId = BlogContentItemId);
            item.Alter<LocalizationPart>(part =>
            {
                part.Culture = culture;
                part.LocalizationSet = localizationSet;
            });

            await contentManager.CreateAsync(item, VersionOptions.Published);
            id = item.ContentItemId;
        });

        return id;
    }
}
