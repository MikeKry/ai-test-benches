// Acceptance tests for #10285 (Delete Content Items deployment step), written after all runs strictly from
// prereg/acceptance-scenarios.md. Copied into each workspace by acceptance/run.sh; the names that differ
// between solutions come from the per-run adapter (environment variables, see acceptance/adapters.env).
using System.Text.Json.Nodes;
using OrchardCore.ContentManagement;
using OrchardCore.Deployment;
using OrchardCore.DisplayManagement.Handlers;
using OrchardCore.Recipes.Models;
using OrchardCore.Tests.Apis.Context;

namespace OrchardCore.Tests.BenchAcceptance;

public class Acceptance10285Tests
{
    // Recipe step name, e.g. "DeleteContent".
    private static string RecipeStep => System.Environment.GetEnvironmentVariable("ACC_10285_RECIPE_STEP");

    // Deployment step class name, e.g. "DeleteContentDeploymentStep".
    private static string DeploymentStep => System.Environment.GetEnvironmentVariable("ACC_10285_DEPLOYMENT_STEP");

    private static JsonObject DeleteRecipe(params string[] ids) => new()
    {
        ["steps"] = new JsonArray
        {
            new JsonObject
            {
                ["name"] = RecipeStep,
                ["ContentItemIds"] = new JsonArray(ids.Select(id => (JsonNode)JsonValue.Create(id)).ToArray()),
            },
        },
    };

    private static async Task<bool> ExistsAsync(BlogPostDeploymentContext context, string id)
    {
        var exists = false;
        await context.UsingTenantScopeAsync(async scope =>
        {
            var contentManager = scope.ServiceProvider.GetRequiredService<IContentManager>();
            exists = await contentManager.GetAsync(id, VersionOptions.Published) is not null
                || await contentManager.GetAsync(id, VersionOptions.Latest) is not null;
        });

        return exists;
    }

    [Fact]
    public async Task S1_DeploymentPlanProducesDeleteRecipeStep()
    {
        Assert.False(string.IsNullOrEmpty(DeploymentStep), "adapter: no deployment step");
        using var context = new BlogPostDeploymentContext();
        await context.InitializeAsync();

        JsonObject produced = null;
        await context.UsingTenantScopeAsync(async scope =>
        {
            var factory = scope.ServiceProvider.GetServices<IDeploymentStepFactory>().Single(f => f.Name == DeploymentStep);
            var step = factory.Create();
            step.GetType().GetProperty("ContentItemIds").SetValue(step, new[] { context.BlogPostContentItemId });

            var result = new DeploymentPlanResult(null, new RecipeDescriptor());
            foreach (var source in scope.ServiceProvider.GetServices<IDeploymentSource>())
            {
                await source.ProcessDeploymentStepAsync(step, result);
            }

            produced = result.Steps.SingleOrDefault(s => s["name"]?.GetValue<string>() == RecipeStep);
        });

        Assert.NotNull(produced);
        Assert.Contains(context.BlogPostContentItemId, produced.ToJsonString());
    }

    [Fact]
    public async Task S2_RecipeStepRemovesContentItems()
    {
        using var context = new BlogPostDeploymentContext();
        await context.InitializeAsync();
        Assert.True(await ExistsAsync(context, context.BlogPostContentItemId));

        await context.PostRecipeAsync(DeleteRecipe(context.BlogPostContentItemId));

        Assert.False(await ExistsAsync(context, context.BlogPostContentItemId));
    }

    [Fact]
    public async Task S3_RecipeStepIsIdempotentAndIgnoresMissingIds()
    {
        using var context = new BlogPostDeploymentContext();
        await context.InitializeAsync();

        var recipe = DeleteRecipe(context.BlogPostContentItemId, "doesnotexist0000000000000");
        await context.PostRecipeAsync(recipe);
        await context.PostRecipeAsync(recipe);

        Assert.False(await ExistsAsync(context, context.BlogPostContentItemId));
    }

    [Fact]
    public async Task S4_StepCanBeAddedInThePlanEditor()
    {
        Assert.False(string.IsNullOrEmpty(DeploymentStep), "adapter: no deployment step");
        using var context = new BlogPostDeploymentContext();
        await context.InitializeAsync();

        await context.UsingTenantScopeAsync(scope =>
        {
            Assert.Contains(scope.ServiceProvider.GetServices<IDeploymentStepFactory>(), f => f.Name == DeploymentStep);
            var drivers = scope.ServiceProvider.GetServices<IDisplayDriver<DeploymentStep>>();
            Assert.Contains(drivers, d => HandlesStep(d.GetType(), DeploymentStep));
            return Task.CompletedTask;
        });
    }

    private static bool HandlesStep(Type type, string stepName)
    {
        for (var t = type; t is not null; t = t.BaseType)
        {
            if (t.IsGenericType && t.GetGenericArguments().Any(a => a.Name == stepName))
            {
                return true;
            }
        }

        return false;
    }
}
