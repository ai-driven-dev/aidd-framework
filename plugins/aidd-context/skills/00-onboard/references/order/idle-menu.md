# Idle menu

When ranks 1-3 are clear, the idle menu offers four choices.

| Slot | Choice              | Opens (installed members)                                             |
| ---- | ------------------- | -------------------------------------------------------------------- |
| 1    | start new work      | `aidd-orchestrator:01-sdlc`, or `aidd-refine:01-brainstorm` for a fuzzy idea  |
| 2    | improve the project | `aidd-dev:` `04-audit` · `06-test` · `07-refactor`                   |
| 3    | customize the AI    | the **missing** `aidd-context:` generators: rule `05-rule-generate`, workflow `04-skill-generate`, agent `06-agent-generate`, command `07-command-generate`, hook `08-hook-generate` |
| 4    | explore             | `aidd-context:11-explore` + anything not in 1-3                       |

- Slots 2 and 3 are umbrellas: a pick re-renders the member sub-list, a member pick runs. Slots 1 and 4 run directly.
- Installed members only. Drop an empty umbrella.
- Choices, not a chain: `OK` never walks the idle menu.
