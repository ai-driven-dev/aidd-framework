# 01 - Capture rule

Settle the rule's topic and place before writing.

## Input

A rule topic (e.g. "TypeScript naming"), or `auto` to scan the codebase and propose rules. Empty means manual.

## Output

In-context: the topic, its category and slug, the file scope, a one-line description, and the write mode (host with supported tools, or plugin source).

## Process

1. **Gate.** Run the asset-access precheck ([tool-paths.md](../references/tool-paths.md)).
2. **Auto or manual.** Ask whether to run auto or manual mode:
   - **Auto**: scan the codebase, propose a rules architecture, wait for approval.
   - **Manual**: ask the topic (blocking). Confirm any candidate first.
3. **Place.** Pick the category and slug from [rule-authoring.md](../references/rule-authoring.md). The category index drives the slug prefix.
4. **Scope.** State the glob the rule applies to, or note it applies to all files. Note a one-line description of what the rule governs, for tools whose scope frontmatter needs it.
5. **Write mode.** Ask where the rule goes:
   - **Host project**: detect the installed tools ([tool-paths.md](../references/tool-paths.md)), propose the supported ones, and confirm which to target. Never pick one silently.
   - **Plugin source**: confirm or create `plugins/<plugin>/rules/`.

## Test

- The topic, category, and slug are stated and confirmed in writing.
- Unsupported tools are named with what to do instead.
