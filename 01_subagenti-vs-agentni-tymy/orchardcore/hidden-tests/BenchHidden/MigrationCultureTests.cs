using OrchardCore.ContentLocalization.Records;
using OrchardCore.Data;
using OrchardCore.Data.Migration;
using OrchardCore.Data.Migration.Records;
using YesSql;

namespace OrchardCore.Tests.BenchHidden;

/// <summary>Requirement 2: a migration converts existing culture values to lower case.</summary>
public class MigrationCultureTests
{
    // The class is OrchardCore.ContentLocalization.Records.Migrations; matched loosely in case it moves.
    private static bool IsLocalizationMigration(global::OrchardCore.Data.Migration.Records.DataMigration migration)
        => migration.DataMigrationClass.StartsWith("OrchardCore.ContentLocalization.", StringComparison.Ordinal)
        && migration.DataMigrationClass.EndsWith(".Migrations", StringComparison.Ordinal);
    private const int VersionBeforeTheFix = 4;

    private sealed record Row(string ContentItemId, string Culture, string LocalizationSet, bool Published, bool Latest);

    /// <summary>Runs SQL against the LocalizedContentItemIndex table of the tenant.</summary>
    private static async Task<List<Row>> ExecuteAsync(CultureCaseContext context, string updateSql = null, params (string Name, object Value)[] parameters)
    {
        List<Row> rows = null;

        await context.UsingTenantScopeAsync(async scope =>
        {
            var store = scope.ServiceProvider.GetRequiredService<IStore>();
            var accessor = scope.ServiceProvider.GetRequiredService<IDbConnectionAccessor>();
            var dialect = store.Configuration.SqlDialect;
            var table = dialect.QuoteForTableName(store.Configuration.TablePrefix + nameof(LocalizedContentItemIndex), store.Configuration.Schema);
            string Column(string name) => dialect.QuoteForColumnName(name);

            await using var connection = accessor.CreateConnection();
            await connection.OpenAsync();

            if (updateSql != null)
            {
                await using var update = connection.CreateCommand();
                update.CommandText = updateSql.Replace("{table}", table).Replace("{culture}", Column("Culture")).Replace("{id}", Column("ContentItemId"));
                foreach (var (name, value) in parameters)
                {
                    var parameter = update.CreateParameter();
                    parameter.ParameterName = name;
                    parameter.Value = value ?? DBNull.Value;
                    update.Parameters.Add(parameter);
                }

                await update.ExecuteNonQueryAsync();
            }

            await using var select = connection.CreateCommand();
            select.CommandText = $"SELECT {Column("ContentItemId")}, {Column("Culture")}, {Column("LocalizationSet")}, {Column("Published")}, {Column("Latest")} FROM {table}";
            await using var reader = await select.ExecuteReaderAsync();
            rows = [];
            while (await reader.ReadAsync())
            {
                rows.Add(new Row(
                    reader.GetString(0),
                    reader.IsDBNull(1) ? null : reader.GetString(1),
                    reader.IsDBNull(2) ? null : reader.GetString(2),
                    Convert.ToBoolean(reader.GetValue(3)),
                    Convert.ToBoolean(reader.GetValue(4))));
            }
        });

        return rows;
    }

    private static Task SetAsync(CultureCaseContext context, string contentItemId, string culture)
        => ExecuteAsync(context, "UPDATE {table} SET {culture} = @culture WHERE {id} = @id", ("@culture", culture), ("@id", contentItemId));

    /// <summary>Puts the migration of the feature back to the version before the fix and runs the pending steps.</summary>
    private static async Task<int?> RerunMigrationsAsync(CultureCaseContext context)
    {
        await context.UsingTenantScopeAsync(async scope =>
        {
            var session = scope.ServiceProvider.GetRequiredService<YesSql.ISession>();
            var record = await session.Query<DataMigrationRecord>().FirstOrDefaultAsync();
            var migration = record.DataMigrations.Single(IsLocalizationMigration);
            migration.Version = VersionBeforeTheFix;
            await session.SaveAsync(record);
        });

        await context.UsingTenantScopeAsync(async scope =>
        {
            var manager = scope.ServiceProvider.GetRequiredService<IDataMigrationManager>();
            await manager.UpdateAsync("OrchardCore.ContentLocalization");
        });

        await context.WaitForDeferredTasksAsync(TestContext.Current.CancellationToken);

        int? version = null;
        await context.UsingTenantScopeAsync(async scope =>
        {
            var session = scope.ServiceProvider.GetRequiredService<YesSql.ISession>();
            var record = await session.Query<DataMigrationRecord>().FirstOrDefaultAsync();
            version = record.DataMigrations.Single(IsLocalizationMigration).Version;
        });

        return version;
    }

    [Fact]
    public async Task NewSite_IsAtANewerMigrationVersion()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        int? version = null;
        await context.UsingTenantScopeAsync(async scope =>
        {
            var session = scope.ServiceProvider.GetRequiredService<YesSql.ISession>();
            var record = await session.Query<DataMigrationRecord>().FirstOrDefaultAsync();
            version = record.DataMigrations.Single(IsLocalizationMigration).Version;
        });

        Assert.True(version > VersionBeforeTheFix, $"version is {version}");
    }

    [Fact]
    public async Task Migration_LowerCasesExistingCultures()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        // Simulate records written before the culture was normalized.
        await SetAsync(context, context.GbPostId, "en-GB");
        await SetAsync(context, context.FrPostId, "FR-fr");
        var before = await ExecuteAsync(context);
        Assert.Contains(before, row => row.Culture == "en-GB");

        var version = await RerunMigrationsAsync(context);
        var after = await ExecuteAsync(context);

        Assert.True(version > VersionBeforeTheFix, $"version is {version}");
        Assert.Equal("en-gb", after.Single(row => row.ContentItemId == context.GbPostId).Culture);
        Assert.Equal("fr-fr", after.Single(row => row.ContentItemId == context.FrPostId).Culture);
        Assert.Equal("en-us", after.Single(row => row.ContentItemId == context.UsPostId).Culture);
        Assert.All(after.Where(row => row.Culture != null), row => Assert.Equal(row.Culture.ToLowerInvariant(), row.Culture));
    }

    [Fact]
    public async Task Migration_KeepsNullCulturesAndOtherColumns()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        await SetAsync(context, context.GbPostId, "EN-GB");
        await SetAsync(context, context.FrPostId, null);
        var before = await ExecuteAsync(context);

        await RerunMigrationsAsync(context);
        var after = await ExecuteAsync(context);

        Assert.Equal(before.Count, after.Count);
        Assert.Null(after.Single(row => row.ContentItemId == context.FrPostId).Culture);
        foreach (var row in before)
        {
            var migrated = after.Single(r => r.ContentItemId == row.ContentItemId);
            Assert.Equal(row with { Culture = row.Culture?.ToLowerInvariant() }, migrated);
        }
    }

    [Fact]
    public async Task MigratedRecords_AreFoundByAnyCasing()
    {
        using var context = new CultureCaseContext();
        await context.InitializeAsync();

        await SetAsync(context, context.GbPostId, "en-GB");
        await RerunMigrationsAsync(context);

        var result = await context.GraphQLClient.Content.Query(
            "blogPost(where: { localization: { culture: \"en-gb\" } }) { contentItemId }");
        var ids = result["data"]["blogPost"].AsArray().Select(node => node["contentItemId"].ToString());
        Assert.Contains(context.GbPostId, ids);
    }
}
