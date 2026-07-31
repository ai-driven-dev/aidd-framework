# 02 - Write command

Build one canonical command and write it for each supported tool.

## Input

From 01: the name, goal, location, arguments, and write mode.

## Output

One command file per supported confirmed tool, the list of files written, and any skipped tool with its reason.

## Process

1. **Build.** Copy [command-template.md](../assets/command-template.md) into one canonical command: single objective, under ten steps, no Role section. Strip the scaffold (comments + `<...>`).
2. **Frontmatter.** Set the fields per tool from [tool-paths.md](../references/tool-paths.md). Drop a field a tool does not support.
3. **Render.** Per the write mode ([tool-paths.md](../references/tool-paths.md)):
   - **Host**: for each supported confirmed tool, write to its path at the chosen location. Skip an unsupported tool, carrying its reason forward.
   - **Plugin source**: write one canonical `.md` command. No per-tool fan-out.
4. **Arguments.** If the command takes input, reference it with `$ARGUMENTS`. For a CLI call, use the injection syntax only where the target tool supports it, otherwise describe the command in the body ([command-authoring.md](../references/command-authoring.md)).
5. **Validate.** Run the write-target validation ([tool-paths.md](../references/tool-paths.md)).

## Test

- Each command file exists at its tool's commands path, at the chosen location.
- The body carries no Role section. It uses `$ARGUMENTS` when the command takes input.
