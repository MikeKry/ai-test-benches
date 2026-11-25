// Acceptance test for #10539 S3 (existing IDeploymentSource implementations compile and run unchanged),
// written after all runs from prereg/acceptance-scenarios.md. S1, S2 and S4 depend on the design of the
// callback (its name and shape differ between solutions) and are scored by the blind review.
using OrchardCore.Deployment;

namespace OrchardCore.Tests.BenchAcceptance;

public class Acceptance10539Tests
{
    // An implementation written against the interface of the base commit: only ProcessDeploymentStepAsync.
    private sealed class LegacySource : IDeploymentSource
    {
        public bool Called { get; private set; }

        public Task ProcessDeploymentStepAsync(DeploymentStep step, DeploymentPlanResult result)
        {
            Called = true;
            return Task.CompletedTask;
        }
    }

    [Fact]
    public void S3_InterfaceHasNoNewAbstractMembers()
    {
        var abstractMembers = typeof(IDeploymentSource).GetMethods()
            .Where(m => m.IsAbstract)
            .Select(m => m.Name)
            .ToArray();

        Assert.Equal([nameof(IDeploymentSource.ProcessDeploymentStepAsync)], abstractMembers);
    }

    [Fact]
    public async Task S3_LegacyImplementationRuns()
    {
        var source = new LegacySource();
        await source.ProcessDeploymentStepAsync(null, null);
        Assert.True(source.Called);
    }
}
