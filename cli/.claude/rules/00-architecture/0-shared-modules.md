---
description: Apply before creating or moving into a shared/ directory; sharing is earned by two calling areas.
paths:
  - "src/contexts/**/*.ts"
---

# Shared Modules

- `shared/` needs callers in two areas.
- One caller: move it down.
- Never share for a caller not yet written.
- An area is `application/<subdirectory>/` or the application root.
- `runtime/wiring/` is never an area.
- Count first: `grep -rl <module> src`; `earned-sharing.arch.test.ts` counts the same.
- A file nested under a shared module is its private step.
- A promoted module follows `0-hexagonal.md`.
- Crossing a context: declare the module public (`0-contexts.md`).
- Move to `kernel/` only once it stops being business logic.
