---
paths:
  - "src/**/*.ts"
  - "src/domain/**/*.ts"
---

# Method Size Limit

## Rules

- Hard limit: ≤ 20 lines per method (public or private)
- Enforced by `noExcessiveLinesPerFunction` in `cli/biome.json`, everywhere under `src/`
- `src/application/commands/` is exempt: registering a subcommand is a declarative block,
  and splitting it hides the command surface rather than clarifying it
- Code lines count; blank lines and comment-only lines excluded
- Extracted method name describes intent, not mechanics

## Anti-patterns

- `executeInternal()` — splits execute() without naming a concept
- `handleXxxWithLongBody()` — names mechanics, not intent
- Bad: `writeThenHash()` → Good: `applyFrameworkFile()`
- Bad: `loopOverAddedEntries()` → Good: `installAddedFiles()`
