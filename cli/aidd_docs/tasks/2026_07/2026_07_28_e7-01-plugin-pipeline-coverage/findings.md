---
objective: "Know which branches the E7 refactors would rewrite blind, and close the worst of them first."
status: in-progress
---

# SPIKE-E7-01 — coverage of the plugin pipeline

Measured with `vitest --coverage` over `unit` + `integration` (1977 tests), scoped to the files US-E7-02/03/04/05 touch.

## Coverage, worst first

| File | Branch | Line | Rewritten by |
| ---- | -----: | ---: | ------------ |
| `plugin/plugin-update-use-case.ts` | **50.0%** | 83.7% | US-E7-02 **and** US-E7-03 |
| `marketplace/marketplace-sync-settings-use-case.ts` | 61.7% | 87.9% | *(none — see below)* |
| `plugin/plugin-remove-use-case.ts` | 64.3% | 96.5% | US-E7-02 |
| `plugin/plugin-pick-use-case.ts` | 66.7% | 91.8% | US-E7-04 |
| `marketplace/marketplace-check-use-case.ts` | 71.4% | 92.6% | US-E7-05 |
| `shared/apply-plugin-files-use-case.ts` | 87.0% | **75.9%** | US-E7-03 |
| `marketplace/marketplace-list-use-case.ts` | 77.8% | 100% | US-E7-05 |
| `plugin/translator/mode-b-flat-materialization-translator.ts` | 83.3% | 98.7% | US-E7-02 |
| `marketplace/marketplace-refresh-use-case.ts` | 86.2% | 97.5% | US-E7-05 |
| `plugin/plugin-add-use-case.ts` | 92.3% | 99.2% | US-E7-03 |
| `plugin/plugin-install-from-marketplace-use-case.ts` | 94.3% | 93.7% | US-E7-04 |
| `plugin/plugin-search-use-case.ts` | 94.4% | 100% | US-E7-04 |
| `marketplace/marketplace-add-use-case.ts` | 95.2% | 97.0% | US-E7-05 |
| `shared/resolve-marketplace-use-case.ts` | 100% | 100% | US-E7-05 (target) |

Total across the set: 81.6% branches, 93.2% lines.

## The blocking finding

**`PluginUpdateUseCase` is the file both US-E7-02 and US-E7-03 rewrite, and the exact code they consolidate is the code that is never executed by any test.**

| Lines | What | Story that rewrites it |
| ----- | ---- | ---------------------- |
| 117-129 | the built-tree branch of `replacePluginFiles` — `removePlugin` then `builtTree.addPlugin(...)` | US-E7-03 (this *is* the "resolve translator → built-tree-or-fallback" it collapses) |
| 155-164 | body of `builtTreeTranslator` — only its early `return null` is reached | US-E7-03 |
| 170-175 | user-scope path of `resolveBaseDir` | US-E7-02 (this *is* the helper it extracts) |

Root cause: `plugin-update-use-case.unit.test.ts` has two tests, both on `claude` — a project-scope, non-materializing tool — and **both construct the use-case without `builtDeps`**, while `deps.ts:615-622` always passes `builtMaterializationDeps`. The unit test therefore exercises a differently-configured object than production, and `builtTreeTranslator` returns `null` at line 155 every time.

Other uncovered lines, for the stories that own them:

- `plugin-remove-use-case.ts` — branches 62, 64, 66, 77, 79, 80, 89, 107, 109, 111; statements 90, 91, 112.
- `plugin-pick-use-case.ts` — branches 48, 59, 68, 72, 95; statements 49-52, 60, 61.
- `apply-plugin-files-use-case.ts` — branches 50, 61, 69; statements 73-89 (one unbroken block).
- `marketplace-check-use-case.ts` — branches 72, 90, 92, 105; statements 73-75, 93, 94.
- `marketplace-list-use-case.ts` — branches 50, 61.

## Decisions

| Decision | Why |
| -------- | --- |
| Characterization tests belong to the spike, not to each refactor | A test written while refactoring is shaped by the new code and cannot detect that the behaviour moved. It has to exist against the current structure first. |
| This PR closes `PluginUpdateUseCase` only; each remaining story is gated on its own characterization tests landing first | It is the one file two stories rewrite, and the only one whose target code is at zero coverage. The rest are enumerated above line-by-line, so each is mechanical rather than exploratory. |
| `marketplace-sync-settings-use-case.ts` (61.7%) left alone | No E7 story touches it. Recorded so its low coverage is not mistaken for something this epic covered. |

## Consequence for the epic

US-E7-03's declared dependency on **E3-BUG06 dissolves** — that spike infirmed its bug, so there is no fix to sequence behind.
