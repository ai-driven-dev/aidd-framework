---
paths:
  - "src/presentation/commands/**/*.ts"
  - "src/cli.ts"
  - "src/runtime/wiring/**/*.ts"
---

# Dependency Wiring

## Factories

- `createDeps` — full dep graph, command actions only
- `createMenuDeps` — `ManifestRepository` + `Prompter`, pre-parse only
- Never instantiate adapters directly in `cli.ts`

## Memoization

- `createDeps` is memoized by `projectRoot`
- `preAction` hook always first caller per project root
- Commands reuse cached instance, no extra I/O
- No second cache layer in command files

## cli.ts body rules

- `createMenuDeps` only before `program.parse()`
- Never call `createDeps` before `program.parse()`
- Extend `createMenuDeps` if pre-parse needs grow
