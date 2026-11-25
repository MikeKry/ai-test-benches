using System.Text.Json.Nodes;

namespace OrchardCore.Tests.BenchHidden;

/// <summary>Requirement 1: GraphQL 'where' filtering on the culture ignores case.</summary>
public class GraphQLCultureTests
{
    private static async Task<string[]> QueryIdsAsync(CultureCaseContext context, string filter)
    {
        var result = await context.GraphQLClient.Content.Query(
            $"blogPost(where: {{ localization: {{ {filter} }} }}) {{ contentItemId }}");

        Assert.True(result["errors"] is null, result["errors"]?.ToJsonString());

        // Only the three localized posts of the context are relevant.
        var ours = new[] { context.UsPostId, context.GbPostId, context.FrPostId };
        return result["data"]["blogPost"].AsArray()
            .Select(node => node["contentItemId"].ToString())
            .Where(ours.Contains)
            .Order()
            .ToArray();
    }

    private static string[] Ids(params string[] ids) => ids.Order().ToArray();

    [Theory]
    [InlineData("en-GB")]
    [InlineData("EN-GB")]
    [InlineData("en-gb")]
    [InlineData("En-Gb")]
    public async Task Equal_IgnoresCase(string culture)
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        Assert.Equal(Ids(context.GbPostId), await QueryIdsAsync(context, $"culture: \"{culture}\""));
    }

    [Fact]
    public async Task In_IgnoresCase()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        Assert.Equal(
            Ids(context.GbPostId, context.FrPostId),
            await QueryIdsAsync(context, "culture_in: [\"EN-GB\", \"Fr-fr\"]"));
    }

    [Fact]
    public async Task NotEqual_And_NotIn_IgnoreCase()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        Assert.Equal(Ids(context.GbPostId, context.FrPostId), await QueryIdsAsync(context, "culture_not: \"EN-US\""));
        Assert.Equal(Ids(context.FrPostId), await QueryIdsAsync(context, "culture_not_in: [\"EN-us\", \"en-GB\"]"));
    }

    [Fact]
    public async Task Like_Operators_IgnoreCase()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        Assert.Equal(Ids(context.UsPostId, context.GbPostId), await QueryIdsAsync(context, "culture_starts_with: \"EN-\""));
        Assert.Equal(Ids(context.GbPostId), await QueryIdsAsync(context, "culture_ends_with: \"-GB\""));
        Assert.Equal(Ids(context.GbPostId), await QueryIdsAsync(context, "culture_contains: \"N-G\""));
        Assert.Equal(Ids(context.UsPostId, context.FrPostId), await QueryIdsAsync(context, "culture_not_contains: \"-GB\""));
    }

    [Fact]
    public async Task OtherProperties_KeepTheirBehaviour()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        // The localization set keeps working (it is an identifier; whether it ignores case depends on the database).
        Assert.Equal(Ids(context.UsPostId, context.GbPostId), await QueryIdsAsync(context, "localizationSet: \"set-one\""));

        // Combining the culture with another property still works.
        Assert.Equal(
            Ids(context.GbPostId),
            await QueryIdsAsync(context, "localizationSet: \"set-one\", culture: \"EN-GB\""));
    }
}
