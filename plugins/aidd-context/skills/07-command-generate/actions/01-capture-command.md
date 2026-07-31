# 01 - Capture command

Settle the command's goal, location, and arguments before writing.

## Input

A free-form description of what the command should do.

## Output

In-context: the command name and one-line goal, its location, its arguments, the frontmatter intent, and the write mode (host with supported tools, or plugin source).

## Process

1. **Gate.** Run the asset-access precheck ([tool-paths.md](../references/tool-paths.md)).
2. **Goal.** Ask the single objective in one sentence. A command does one thing.
3. **Form.** If it needs supporting files or many steps, redirect the user to the skill generator instead.
4. **Place.** Ask the user where the command should live. An optional ordering convention is in [command-authoring.md](../references/command-authoring.md) if they want it, but never impose a location.
5. **Arguments.** Note any arguments it takes. If it takes input, `$ARGUMENTS` carries it. A no-argument command needs none.
6. **Write mode.** Ask where the command goes:
   - **Host project**: detect the installed tools ([tool-paths.md](../references/tool-paths.md)), propose the supported ones, and confirm which to target. Never pick one silently.
   - **Plugin source**: confirm or create `plugins/<plugin>/commands/`.

## Test

- The goal, location, and arguments are stated and confirmed in writing.
- A multi-step or file-backed request was redirected to the skill generator.
