# 04 - Apply recipe

Analyse a chosen recipe, ask the user what to do, then run the agent-doable steps and report the rest.

## Input

The recipe to apply, named by number from the latest `list`, slug, title, or topic.

## Output

A short analysis of the recipe — what it achieves, and which steps the agent can run versus which are the human's — then, on the user's choice, the chosen steps carried out and a report of what is left for the human.

## Process

1. **Locate.** Resolve the recipe with [recipe-locations.md](../references/recipe-locations.md) and read it. Run `list` first when the recipe is unnamed or when the user gives a number but no current numbered list is available.
2. **Analyse.** Read each step and classify it: agent-doable (a file edit, a config change) or human-only (a TUI command, an install, anything needing the user's terminal or UI). Summarise what the recipe achieves and what is in scope for the agent.
3. **Ask.** Show the analysis and ask the user what to do — run all agent-doable steps, a subset, or just report. Never mutate before this answer.
4. **Execute.** For the chosen steps, work them as a tracked todo list, pausing for confirmation on any step that changes a file. Leave the human-only steps untouched.
5. **Report.** Report what was done, list the human-only steps as instructions for the user, and run any `## Verify` checks.

## Test

- Applying a recipe first produces an analysis that marks each step agent-doable or human-only, then asks the user what to do before any change.
- A numeric choice maps to the matching row from the latest `list`; if no current list exists, `apply` reruns `list` and asks for the number again.
- The chosen agent-doable steps run as a todo list; human-only steps are reported as instructions, never executed.
