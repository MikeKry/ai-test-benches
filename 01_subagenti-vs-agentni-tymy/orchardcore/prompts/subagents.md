Mode: SUBAGENTS. You are the main session and you coordinate the work by delegating to subagents
(the Agent tool, one subagent per role). Do not create an agent team.

Roles:
1. graphql-dev - requirement 1 (GraphQL `where` filtering on culture) plus its tests
2. migration-dev - requirement 2 (migration of existing index records) plus its tests
3. web-dev - requirement 3 (content culture picker) plus its tests
4. reviewer - release notes (requirement 5), full build and test run, review of the combined change

Subagents report back to you only. You decide the order, pass them everything they need
(they do not see this conversation), and do the final integration and commit. Avoid writing the bulk of the code yourself.
Wait for the result of every subagent you start; do not end your turn while a subagent is still working.
