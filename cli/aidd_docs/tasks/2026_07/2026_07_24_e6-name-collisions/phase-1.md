---
status: done
---

# Instruction: Rename both collisions

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/src/
    ├── application/use-cases/framework/strategies/
    │   ├── marketplace-strategy-helpers.ts                          ✏️ modify (rename function)
    │   └── tool-contracts.ts                                        ✏️ modify (call site)
    ├── application/use-cases/plugin/
    │   ├── plugin-add-use-case.ts                                   ✏️ modify (import)
    │   └── plugin-update-use-case.ts                                ✏️ modify (import)
    ├── application/use-cases/plugin/translator/
    │   └── mode-b-flat-materialization-translator.ts                ✏️ modify (drop alias workaround)
    ├── application/use-cases/shared/
    │   └── apply-plugin-files-use-case.ts                           ✏️ modify (import)
    └── domain/models/
        ├── plugin-translator.ts                                     ❌ delete (renamed)
        └── plugin-content-translator.ts                             ✅ create (renamed)
cli/tests/domain/models/
├── plugin-distribution-translate.unit.test.ts                       ✏️ modify (import)
└── plugin-translator-skip.unit.test.ts                              ✏️ modify (import)
```

## Tasks to do

### `1)` Rename `buildClaudeStyleMarketplaceEntry` → `buildClaudeStyleCatalogEntry`

> The marketplace-catalog-entry side, `marketplace-strategy-helpers.ts:169`. The domain/capabilities one (`settings.json` entry) keeps its name.

1. In `marketplace-strategy-helpers.ts`, rename the function definition (line 169).
2. In `tool-contracts.ts`, update the 2 references (import + call, lines 65 and 109).

### `2)` Rename the domain `PluginTranslator` class → `PluginContentTranslator`

> The content-format-conversion side. The application-layer strategy interface (`plugin/translator/plugin-translator.ts`) keeps its name — do not touch it.

1. Rename `src/domain/models/plugin-translator.ts` → `src/domain/models/plugin-content-translator.ts`, renaming the `export class PluginTranslator` to `export class PluginContentTranslator` inside it.
2. Update imports in `plugin-add-use-case.ts`, `plugin-update-use-case.ts`, `apply-plugin-files-use-case.ts` — new path, new name, no more alias needed.
3. In `mode-b-flat-materialization-translator.ts`, drop the `PluginTranslator as PluginTranslatorHelper` alias workaround — import `PluginContentTranslator` directly under its real name, update the local usages.
4. Update the 2 test files (`tests/domain/models/plugin-distribution-translate.unit.test.ts`, `tests/domain/models/plugin-translator-skip.unit.test.ts`) — new import path/name. Consider also renaming these test files to match (`plugin-content-translator-*`) if the project's test-naming convention expects it; not required by the ticket's DoD, judgment call at implementation time.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | `grep -rn "buildClaudeStyleMarketplaceEntry" src/` finds only the domain/capabilities definition and its 2 tool-file consumers — never the catalog-building one. |
| 1    | `aidd framework build` (marketplace mode) produces byte-identical output to before the rename. |
| 2    | `grep -rn "PluginTranslator\b" src/` (word-boundary) finds only the application-layer interface and its 4 implementer/factory sites — never the domain class. |
| 2    | `aidd plugin add`/`aidd plugin update` produce identical installed files to before the rename. |
| all  | `tsc --noEmit` clean, full existing test suite passes with zero assertion changes (pure rename). |
