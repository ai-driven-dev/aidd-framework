# 02 - Upsert recipe

Create or update one project recipe at `aidd_docs/recipes/<slug>.md`, scaffolded from the recipe template and following the recipe contract.

## Input

The recipe topic. Ask for any missing field (description, steps, verify, related) before writing.

## Output

The recipe file at `aidd_docs/recipes/<slug>.md`, filled from the template.

## Process

1. **Research first.** For a new recipe or any substantial update, run `research` (03) on the topic and draft only from its verified results — never from memory.
2. Derive a kebab-case `<slug>` from the topic.
3. Resolve existing recipes with [recipe-locations.md](../references/recipe-locations.md).
4. If the project recipe exists, update `aidd_docs/recipes/<slug>.md` in place.
5. If only a bundled recipe exists, ask whether to copy/update it into `aidd_docs/recipes/<slug>.md` or edit the bundled framework recipe. Only edit bundled recipes when the user explicitly asks for that framework-source change.
6. If the recipe is new, run `list` and rate each near match in an overlap table `| Existing recipe | Source | Shared scope | Overlap |`, where `Overlap` is none, partial, or high. On any `high`, recommend updating that recipe instead, and ask update-or-create before scaffolding.
7. Scaffold from [recipe-template.md](../assets/recipe-template.md) when needed. Apply [recipe-contract.md](../references/recipe-contract.md) to every section.
8. Fill every placeholder. Do not maintain a separate recipe index; `list` reads the recipe files directly.

## Test

- A new or substantially-updated recipe is drafted from `research` results, not from memory.
- `aidd_docs/recipes/<slug>.md` exists and follows the recipe contract: opens with a one-sentence description (no Goal label, no table), each step a `#### N)` emoji heading with a real example, no `<...>` placeholder left.
- A bundled recipe is never overwritten unless the user explicitly asks to change a bundled/framework recipe.
- A new recipe that highly overlaps an existing project or bundled recipe triggers an update-or-create prompt before scaffolding.
