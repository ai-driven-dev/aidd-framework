# 01 - Survey

Read the project across the three axes and present a compact map. Scan quietly, then give one grouped overview.

## Input

The project root.

## Output

A map grouped by axis, Tooling, Context, and Codebase. Each axis lists what is there, one line per item or a short count, with no recommendation. Then a proposal to dig into one axis or all.

## Process

1. **Detect the tools.** Find which AI tools the project uses by the presence signal in [ai-mapping.md](../references/ai-mapping.md), keying on a tool's own mapped surfaces, never a shared parent directory. Propose the set when it is ambiguous, never assume one silently.
2. **Scan Tooling.** For each detected tool, gather the installed skills, agents, commands, rules, hooks, MCP servers, and plugins from the surfaces in [ai-mapping.md](../references/ai-mapping.md).
3. **Scan Context.** The memory bank under `aidd_docs/memory/` and whether its files are filled, any specs or plans under `aidd_docs/`, and whether the AI context files carry the `<aidd_project_memory>` block.
4. **Scan Codebase.** The stack, from the manifest or from the memory bank, and the few top-level modules or layers.
5. **Present the map.** One section per axis, each a short list or count with one-line purposes.
6. **Propose to dig in.** Offer the three axes or all, and hand the pick to `02-drill`. Wait for the answer.

## Test

- The output has the three axes, each listing only what is actually present, with no invented item and no next-step recommendation, and it ends by proposing one axis or all.
