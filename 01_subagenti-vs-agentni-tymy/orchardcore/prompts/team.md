Mode: AGENT TEAM. Create an agent team and act as its lead. Do not just spawn independent subagents.

Teammates:
1. graphql-dev - requirement 1 (GraphQL `where` filtering on culture) plus its tests
2. migration-dev - requirement 2 (migration of existing index records) plus its tests
3. web-dev - requirement 3 (content culture picker) plus its tests
4. reviewer - release notes (requirement 5), full build and test run, review of the combined change

Use the shared task list (with dependencies) and let teammates message each other directly when they
need to agree on shared code (for example a common culture normalization helper). Give every teammate
the full task description. Wait until all teammates are finished, make sure the result builds and the tests
pass, commit, then shut the team down and finish.
