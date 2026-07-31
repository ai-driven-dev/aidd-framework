# 01 - List recipes

List project recipes and bundled recipes as a table, from the two homes in [recipe-locations.md](../references/recipe-locations.md).

## Output

```md
| # | Recipe | Source | Description |
| ---: | --- | --- | --- |
| <n> | [<title>](<path>) | project \| bundled | <description> |
```

One row per recipe file, sorted by source then file name, numbered from 1 after sorting. If both homes are absent or empty: `No recipes yet.`

## Process

1. Read project recipes under `aidd_docs/recipes/*.md`, excluding `README.md`.
2. Read bundled recipes under `../assets/recipes/*.md`, excluding `README.md`.
3. Pull the H1 title and the one-sentence description right below it.
4. If a project recipe and bundled recipe share the same slug, mark the project row as active and the bundled row as shadowed.
5. Assign contiguous numbers from 1 to N after sorting.
6. Render the table above.

## Test

- One row per project and bundled recipe file, each with number, title, source, and description.
- A project recipe with the same slug as a bundled recipe is marked active and overrides the bundled copy.
- Numbers are contiguous, start at 1, and match the displayed sort order.
- Absent/empty project and bundled homes → `No recipes yet`, no error.
