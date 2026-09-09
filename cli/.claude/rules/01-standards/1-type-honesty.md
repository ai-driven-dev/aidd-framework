---
description: Apply to every cast; a value is never widened away from the type it holds.
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Type Honesty

- No `as unknown as`, `as any`, `as never`.
- No `@ts-expect-error` or `@ts-ignore` in `src/`.
- A test proving non-compilation may use `@ts-expect-error`.
- `scripts/check-cli-type-honesty.mjs` enforces both scopes, from the repository root.
- `CASTS_ALLOWED` lists each surviving cast with its reason.
