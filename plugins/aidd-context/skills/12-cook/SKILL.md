---
name: 12-cook
description: Manage project recipes/how-to sheets by listing, creating, updating, researching, or applying a recipe. Use for recipe, cook, /cook, list, new, update, research, apply.
argument-hint: recipe
---

# Cook

Maintains recipe how-to sheets. Project recipes live in `aidd_docs/recipes/`; bundled recipes ship inside this skill under `assets/recipes/`.

## Actions

| #   | Action     | Role                                                         | Input                 |
| --- | ---------- | ----------------------------------------------------------- | --------------------- |
| 01  | `list`     | List every recipe as a table                                | none                  |
| 02  | `upsert`   | Create or update one recipe from the template               | recipe topic + fields |
| 03  | `research` | Survey modern alternatives, gaps, and counter-intuitive wins | recipe or topic      |
| 04  | `apply`    | Execute a recipe on the project as a confirmed todo list    | recipe                |

Run `list` to survey project and bundled recipes, `research` to gather insights, `upsert` to author one, `apply` to run an existing one against the project. Always run `research` before authoring or substantially updating a recipe — never draft from memory alone. Run `list` first when the user names no recipe.
Before running an action, read its file in `actions/`, not only the table or assets.

## References

- `references/recipe-locations.md`: where project and bundled recipes live, how resolution works, and when writes target each home.
- `references/recipe-contract.md`: the rules every recipe file follows; `upsert` writes to it.

## Assets

- `assets/recipe-template.md`: the canonical recipe scaffold `upsert` renders from, and the shape `list` parses.
- `assets/recipes/`: bundled recipes shipped with this skill.
