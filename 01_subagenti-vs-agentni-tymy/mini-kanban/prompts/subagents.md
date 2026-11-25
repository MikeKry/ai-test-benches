Mode: SUBAGENTS. You are the main session and you coordinate the work by delegating to subagents
(the Agent tool, one subagent per role). Do not create an agent team.

Roles:
1. architect - project structure, Vite/TS config, ARCHITECTURE.md
2. domain-dev - `src/domain/` and `src/store/` plus unit tests for them
3. ui-dev - `src/components/` and the app shell
4. tester - end-to-end check that the app really runs and the flows work

Subagents report back to you only. You decide the order, pass them the full interface contract
(they do not see this conversation), and do the final integration. Avoid writing the bulk of the code yourself.
