# 01 - List recipes

List project recipes and bundled recipes as one table.

## Output

```md
| # | Recipe | Source | Description |
| ---: | --- | --- | --- |
| <n> | [<title>](<path>) | project \| bundled | <description> |
```

One row per recipe file, sorted by source then file name, numbered from 1 after sorting. If both homes are absent or empty: `No recipes yet.`

## Process

1. **Read.** Read every recipe in both homes of [recipe-locations.md](../references/recipe-locations.md), excluding `README.md`.
2. **Title.** Pull the H1 title and the one-sentence description right below it.
3. **Shadow.** Mark a project row active and its bundled twin shadowed when both share a slug.
4. **Number.** Sort, then assign contiguous numbers from 1 to N.
5. **Render.** Render the table above.

## Test

- One row per project and bundled recipe file, each with number, title, source, and description.
- A project recipe with the same slug as a bundled recipe is marked active and overrides the bundled copy.
- Numbers are contiguous, start at 1, and match the displayed sort order.
- Absent/empty project and bundled homes → `No recipes yet`, no error.
