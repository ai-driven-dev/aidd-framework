# 02 - Write agent

Render the canonical agent per confirmed tool and write it.

## Input

From 01: the role, the chosen name, the model, and the write mode.

## Output

One agent file per confirmed tool, and the list of files written.

## Process

1. **Build.** Copy [agent-template.md](../assets/agent-template.md) into one canonical agent. Strip the scaffold (comments + `<...>`).
2. **Frontmatter.** Apply the per-tool frontmatter from [tool-paths.md](../references/tool-paths.md). Drop a field where the tool does not support it. Plugin source: keep the canonical frontmatter.
3. **Convert.** Apply any per-tool structural conversion listed in [tool-paths.md](../references/tool-paths.md). Plugin source skips conversion.
4. **Render.** Per the write mode ([tool-paths.md](../references/tool-paths.md)):
   - **Host**: for each confirmed tool, write to its path and extension.
   - **Plugin source**: write one canonical agent. No per-tool fan-out.
5. **Validate.** Run the write-target validation ([tool-paths.md](../references/tool-paths.md)).

## Test

- Each agent file exists at its tool's agents path.
- The file is valid for the AI target tool.
