using System.Net;
using AngleSharp.Html.Parser;
using Microsoft.AspNetCore.Mvc.Testing;
using OrchardCore.Tests.Apis.Context;

namespace OrchardCore.Tests.BenchHidden;

/// <summary>Requirement 3: the content culture picker; plus a regression check of the contents admin list filter.</summary>
public class WebCultureTests
{
    // ---- Regression check: contents admin list filter (already case-insensitive before the change) ---

    [Theory]
    [InlineData("en-GB")]
    [InlineData("EN-GB")]
    [InlineData("en-gb")]
    public async Task AdminList_CultureFilter_SelectsTheSupportedCulture(string culture)
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        var html = await GetAsync(context, $"Admin/Contents/ContentItems?q={Uri.EscapeDataString("culture:" + culture)}");
        using var document = new HtmlParser().ParseDocument(html);

        var select = document.QuerySelector("select.culture-selectpicker");
        Assert.NotNull(select);
        var selected = select.QuerySelectorAll("option").Where(option => option.HasAttribute("selected")).Select(option => option.GetAttribute("value")).ToArray();
        Assert.Equal(["en-GB"], selected);
    }

    // ---- Requirement 3: content culture picker ------------------------------------------------------

    private sealed record PickerResult(HttpStatusCode Status, string Location, string Cookie);

    private static async Task<PickerResult> PickAsync(CultureCaseContext context, string targetCulture, string fromUrl)
    {
        using var client = SiteContext.Site.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = context.Client.BaseAddress,
        });

        using var response = await client.GetAsync(
            $"RedirectToLocalizedContent?targetCulture={Uri.EscapeDataString(targetCulture)}&contentItemUrl={Uri.EscapeDataString(fromUrl)}",
            TestContext.Current.CancellationToken);

        var cookie = response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.LastOrDefault(value => value.StartsWith(".AspNetCore.Culture=", StringComparison.Ordinal))
            : null;

        return new PickerResult(response.StatusCode, response.Headers.Location?.ToString(), cookie?.Split(';')[0]);
    }

    [Theory]
    [InlineData("EN-GB")]
    [InlineData("en-gb")]
    [InlineData("En-gB")]
    public async Task CulturePicker_AcceptsAnyCasing(string targetCulture)
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        var canonical = await PickAsync(context, "en-GB", "/culture-post-us");
        var other = await PickAsync(context, targetCulture, "/culture-post-us");

        // The canonical spelling leads to the GB localization of the US post.
        Assert.EndsWith("/culture-post-gb", canonical.Location);
        Assert.Equal(canonical, other);
    }

    [Fact]
    public async Task CulturePicker_IgnoresUnsupportedCultures()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        var result = await PickAsync(context, "DE-de", "/culture-post-us");

        Assert.EndsWith("/culture-post-us", result.Location);
        Assert.Null(result.Cookie);
    }

    private static async Task<string> GetAsync(SiteContext context, string path)
    {
        using var response = await context.Client.GetAsync(path, TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
    }
}
