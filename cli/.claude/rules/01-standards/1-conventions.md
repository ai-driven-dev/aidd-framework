---
description: Apply to every source and test file; module shape, naming and test tiers.
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Conventions

## Modules

- Named exports only; biome's `noDefaultExport` holds it under `src/` and `tests/`.
- No barrel, no re-export: biome's `noBarrelFile`, `noReExportAll`, `noExportedImports`, plus `no-re-export.arch.test.ts` for `export { x } from` (`tests/helpers/ports/` exempt).
- Import from the defining module, relative, `.js` extension.
- `import type` for a type-only import.

## Names

- `kebab-case.ts` files; suffixes `-adapter.ts`, `-use-case.ts`.
- A port file is named for its interface: `file-merger.ts` for `FileMerger`.
- The ratchets read those suffixes; a misnamed file is invisible.
- `camelCase` values, `PascalCase` types, `CONSTANT_CASE` module constants.
- A leading underscore marks a parameter an interface forces.
- Name the intention: `applyFrameworkFile`, not `writeThenHash`.
- `executeInternal` means no concept was found; do not make it.

## Tests

- The extension declares the tier: `*.unit.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`.
- An `*.arch.test.ts` outside `tests/architecture/` runs nowhere.
- `tests/` mirrors `src/`.

## Duplication

- `pnpm jscpd` fails a copied block.
- Extract at the second caller (`0-shared-modules.md`).
