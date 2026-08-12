# Sync Arguments

Arguments accepted by `hooks/update_memory.js`. The hook maps tool names to context files; it does not detect installed tools.

| Argument | Refreshes |
| -------- | --------- |
| `claude` | `CLAUDE.md` |
| `codex` | `AGENTS.md` |
| `cursor` | `AGENTS.md` |
| `opencode` | `AGENTS.md` |
| `copilot` | `.github/copilot-instructions.md` |
| `gemini` | `AGENTS.md` |

Rules:

- Prefer user-provided arguments.
- Otherwise derive args from synced context files; `AGENTS.md` defaults to `codex`.
- Pass at least one arg and verify nothing is staged.
