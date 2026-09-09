---
description: Apply when a command or use case needs a collaborator; every dependency is built once, in the composition root.
paths:
  - "src/presentation/commands/**/*.ts"
  - "src/cli.ts"
  - "src/runtime/wiring/**/*.ts"
---

# Dependency Wiring

## Factories

- `createDeps(projectRoot, options, output)` builds the full graph.
- Call it from a command action, never before `program.parse()`.
- `createMenuDeps(projectRoot)` serves the menu: a `ManifestRepository`, a `Prompter`.
- Extend that factory for a pre-parse need.
- Never instantiate an adapter in `cli.ts`.
- One wiring module per context under `runtime/wiring/`.
- `runtime/wiring/framework.ts` composes them.
- `cli.ts` builds two things: the version reader, the `CLIOutput`.

## Once

- `createDeps` memoizes on `projectRoot`.
- The `preAction` hook warms it for `process.cwd()`.
- `AIDD_SKIP_UPDATE_CHECK` short-circuits that hook.
- No second cache in a command file.

## Not an area

- The composition root never counts as a caller (`0-shared-modules.md`).
