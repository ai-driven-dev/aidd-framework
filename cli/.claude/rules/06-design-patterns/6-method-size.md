---
paths:
  - "src/application/use-cases/**/*.ts"
  - "src/domain/**/*.ts"
---

# Method Size Limit

## Rules

- Hard limit: ≤ 20 lines per method (public or private)
- Code lines count; blank lines and comment-only lines excluded
- Extracted method name describes intent, not mechanics

## Anti-patterns

- `executeInternal()` — splits execute() without naming a concept
- `handleXxxWithLongBody()` — names mechanics, not intent
- Bad: `writeThenHash()` → Good: `applyFrameworkFile()`
- Bad: `loopOverAddedEntries()` → Good: `installAddedFiles()`
