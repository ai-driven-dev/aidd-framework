# 02 - Upsert recipe

Create or update one project recipe at `aidd_docs/recipes/<slug>.md`, scaffolded from the recipe template and following the recipe contract.

## Input

The recipe topic. Ask for any missing field (description, steps, verify, related) before writing.

## Output

The recipe file at `aidd_docs/recipes/<slug>.md`, filled from the template.

## Process

1. **Research.** For a new recipe or any substantial update, run `research` (03) on the topic and draft only from its verified results, never from memory.
2. **Slug.** Derive a kebab-case `<slug>` from the topic.
3. **Resolve.** Resolve existing recipes with [recipe-locations.md](../references/recipe-locations.md).
   - The project recipe exists: update `aidd_docs/recipes/<slug>.md` in place.
   - Only a bundled recipe exists: ask whether to copy it into `aidd_docs/recipes/<slug>.md` or edit the bundled one. Edit a bundled recipe only when the user asks for that framework-source change.
4. **Dedup.** For a new recipe, run `list` and rate each near match in an overlap table `| Existing recipe | Source | Shared scope | Overlap |`, where `Overlap` is none, partial, or high.
   - On any `high`, recommend updating that recipe instead and ask update-or-create before scaffolding.
5. **Scaffold.** Scaffold from [recipe-template.md](../assets/recipe-template.md) when needed, applying [recipe-contract.md](../references/recipe-contract.md) to every section.
6. **Fill.** Fill every placeholder. Never maintain a separate recipe index; `list` reads the files directly.

## Test

- A new or substantially-updated recipe is drafted from `research` results, not from memory.
- `aidd_docs/recipes/<slug>.md` exists and follows the recipe contract: opens with a one-sentence description (no Goal label, no table), each step a `#### N)` emoji heading with a real example, no `<...>` placeholder left.
- A bundled recipe is never overwritten unless the user explicitly asks to change a bundled/framework recipe.
- A new recipe that highly overlaps an existing project or bundled recipe triggers an update-or-create prompt before scaffolding.
