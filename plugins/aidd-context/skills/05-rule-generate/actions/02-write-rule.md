# 02 - Write rule

Build one canonical rule and write it for each supported tool.

## Input

From 01: the topic, category, slug, scope, and write mode.

## Output

One rule file per supported confirmed tool, the list of files written, and any skipped tool with its reason.

## Process

1. **Build.** Copy [rule-template.md](../assets/rule-template.md) into one canonical rule, concise. Strip the scaffold (comments + `<...>`).
2. **Frontmatter.** Set the per-tool frontmatter from [tool-paths.md](../references/tool-paths.md). Drop a field a tool does not support.
3. **Render.** Per the write mode ([tool-paths.md](../references/tool-paths.md)):
   - **Host**: for each supported confirmed tool, write to its path and extension. Skip an unsupported tool, carrying its reason forward.
   - **Plugin source**: write one canonical `.md` rule. No per-tool fan-out.
4. **Split.** When examples warrant it, write several rule files rather than one crowded one.
5. **Validate.** Run the write-target validation ([tool-paths.md](../references/tool-paths.md)).

## Test

- Each rule file exists at its tool's rules path under the chosen scope.
- The scope frontmatter matches the rule's reach, per [tool-paths.md](../references/tool-paths.md).
