# 05 - Validate recipes

Check one recipe or every available recipe without changing files.

```text
cook validate <recipe>
cook validate all
```

```md
@../references/recipe-locations.md
@../references/recipe-contract.md
```

## Input

A recipe named by number from the latest `list`, slug, title, or path; or `all` for every project and bundled recipe.

## Output

On success:

```text
PASS: <n> recipe(s) validated.
Checks: deterministic and semantic; unavailable parsers: <languages or none>.
```

On failure:

```md
| File | Line | Rule | Fix |
| --- | ---: | --- | --- |
| <path> | <line> | <rule> | <specific correction> |
```

Validation is read-only. Never repair, reformat, or rewrite a recipe during this action.

## Process

1. **Resolve.** Resolve one recipe with `@../references/recipe-locations.md`, or keep `all` as the full project-plus-bundled scope.
2. **Check structure.** Run `node <skill-directory>/scripts/validate-recipe.mjs <resolved-path>` or `node <skill-directory>/scripts/validate-recipe.mjs --all`. Preserve its exit code and findings.
3. **Check semantics.** Apply the Writing, Steps, and Evidence rules from `@../references/recipe-contract.md`; record one line-specific finding per violated rule. For non-JSON snippets, use available native YAML, TOML, and shell parsers and record which languages could not be checked mechanically.
4. **Report.** Merge deterministic and semantic findings into the output table, or print the two success lines. An unavailable optional parser is disclosed but does not fail an otherwise valid recipe. Do not suppress a finding because it requires editorial judgment.

## Test

- One valid recipe and `all` return PASS without changing tracked files.
- A structural failure returns the validator table with file, line, rule, fix, and a non-zero exit code.
- A semantic failure appears in the same table even when the deterministic script passes.
- JSON is parsed mechanically; YAML, TOML, and shell use available tools, and unavailable parsers appear in the success summary or a relevant failure.
