---
paths:
  - "src/presentation/**/*.ts"
---

# CLI Output

## Channels

- `stdout` → nominal output (info, success, print)
- `stderr` → signals (debug, warn, error)
- `Logger` (domain port) ≠ `CLIOutput` (command layer) — never mix
- Conflicts and skips → `warn`, never `error`
- `exit(1)` only via `errorHandler.handle(error)` in catch blocks
- Final summary: one line

## Contract

- Zero logic : only routes messages by log level
- No `exit()` method : error handling belongs in `ErrorHandler`
- No helper methods (formatBytes, formatCounts, etc.)
- Any formatting/transformation belongs in use-cases or domain models
