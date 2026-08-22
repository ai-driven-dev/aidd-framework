# A plugin installed for a tool arrives with hooks that run

## Target

Installing a plugin for any tool that runs hooks gives that tool hooks it can execute, whichever route the install took.

## Hard constraints

- The two install routes deliver the same files. What `aidd framework build` produces and what `aidd plugin install <path>` produces hold the same hooks, spelled for the same tool.
- Which variable a tool expands is declared once and read from that one place. It is already declared for the build route; nothing new is measured and nothing is duplicated.
- A tool declares whether it runs hooks, and that declaration is checked against what the tool actually does rather than defaulted.
- A hook that is installed resolves to a file that exists. A hook resolving to nothing produces no error, no line, and no signal — it is indistinguishable from a working one until someone asks why nothing was recorded.
- A source file keeps naming one variable. Every plugin in this repository writes `${CLAUDE_PLUGIN_ROOT}`; translating it is the installer's job, not the plugin author's.
- Nothing is installed for a tool that cannot run it. A tool with no hook support keeps its skip, with the reason it already carries.

## Non-goals

- Making Codex journal correctly end to end. This makes the hook installable; whether the payload it then receives is recognised is #681's shape of problem, and Codex's own detection is already proven against a captured payload.
- Changing what a hook does, or which events it subscribes to.
- The marketplace build route, which already substitutes correctly.
- OpenCode's plugin API, which is #676.

## Done-when

- A plugin installed for Codex carries its hooks, with commands Codex can resolve.
- The same is true for Copilot and Cursor, whose hooks were installed with another tool's variable.
- A test fails when an installed hook names a variable the target tool does not expand.
- A test fails when the two install routes disagree about which files a plugin delivers.
- Every tool's hook support is declared, and a tool that has none says why.

## Stakeholders

- Decider: repository owner
- Owner: the plugin installation path
- Consumer: every plugin that ships a hook, starting with the run journal

## Context

- Ticket: https://github.com/ai-driven-dev/framework/issues/698, whose comments carry the measurements this rests on.
- Found while testing the run journal on Codex through the real install path. The journal was never silent for want of a detector — its hook was never installed.
- The per-tool token is declared in `application/use-cases/framework/strategies/tool-contracts.ts` and applied by `marketplace-build-strategy.ts`. Codex's is `${PLUGIN_ROOT}` and is already correct.
- Measured: no tool's `rewriteContent` touches the token, so the translation route never substituted it for any tool.
- Blocks step attribution on Codex, and any future plugin that ships a hook.
