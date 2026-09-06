---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Conventions

## Modules

- Named exports only. No `export default`.
- No barrel file, and no re-export of a symbol a module does not define. Either one turns a
  module into a second source of truth for a name it does not own, which is exactly what a
  context boundary would then hide behind. Biome's `noBarrelFile` and `noReExportAll` catch the
  file-shaped forms; `no-re-export.arch.test.ts` catches the two narrower ones they cannot see,
  `export ... from` and a bare `export { X };` after a plain import, with an empty baseline.
  `tests/helpers/ports/` is the single exemption, declared in `biome.json`.
- Import a symbol from the module that defines it, through a relative specifier carrying the
  `.js` extension ESM requires. `import type` for a type-only import.

## Names

- `kebab-case.ts` for every source file. An adapter file ends in `-adapter.ts`, a use case in
  `-use-case.ts`, and a port file matches its interface (`file-system.ts` for `FileSystem`).
  These suffixes are not decoration: the ratchets read them, so a misnamed file is a file no
  rule can see.
- `camelCase` for values and methods, `PascalCase` for classes, interfaces and types,
  `CONSTANT_CASE` for module-level constants.
- A leading underscore marks a parameter or field kept only because an interface forces it,
  which is also how biome's unused-parameter rule is told the omission is deliberate.
- A name states the intention, not the mechanism: `applyFrameworkFile`, not `writeThenHash`.
  An extracted method is named for the concept it isolates, so a name like `executeInternal`
  means the split found no concept and should not have been made.

## Tests

- The extension declares the tier and vitest selects on it: `*.unit.test.ts`,
  `*.integration.test.ts`, `*.e2e.test.ts`. An `*.arch.test.ts` file is matched by extension
  and folder both, so one written outside `tests/architecture/` runs nowhere, silently.
- `tests/` mirrors `src/`. Where it does not, the mirror is what is wrong.

## Duplication

`pnpm jscpd` runs in CI and fails on a copied block. One fact has one home: extract at the
second caller, not the third. Inside a context, where that extraction then belongs is
`.claude/rules/00-architecture/0-shared-modules.md`.
