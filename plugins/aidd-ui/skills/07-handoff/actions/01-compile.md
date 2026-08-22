# 01 - Compile

Write confirmed UI decisions into the task's engineering seam artifact.

## Input

Confirmed interface decisions, their evidence, and an optional task folder.

## Output

`ui.md` in the referenced feature folder, or in `aidd_docs/tasks/{yyyy_mm}/{yyyy_mm_dd}_{feature-slug}/` when no folder exists, filled from [ui-contract.md](../assets/ui-contract.md).

## Process

1. **Resolve.** Select the task folder.
   - A feature folder is referenced: reuse it.
   - No feature folder exists: derive a concise feature slug and create the dated task folder.
   - An existing `ui.md` is not an explicit revision target: ask before replacing it; a decline preserves the file and ends the run.
2. **Fill.** Include applicable intent, flow, screens, reuse, extensions, states, responsive behavior, accessibility requirements, UI decisions, constraints, and open questions.
3. **Strip.** Remove every template instruction, placeholder, empty optional section, and unsupported claim.
4. **Show.** Return the written path and unresolved questions without adding implementation advice.

## Test

| Case | Pass |
| --- | --- |
| Contract written | `ui.md` exists in the resolved task folder |
| Existing primitive | its concrete project name and source are present |
| New primitive | its unmet need and justification are present |
| Missing decision | it appears as an open question rather than an invented choice |
| Replacement declined | the existing `ui.md` reads back unchanged |
| Artifact content | no production component code, CSS, template instruction, or placeholder remains |
