# 04 - Plan

Turn the explored source into a plan and its phases, save them, then review the whole until approved. Never code.

## Input

The explore output from `02-explore` (projection, rules, feasibility, risks), plus any confirmed wireframe from `03-wireframe`.

## Output

A feature folder, always at `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<feature-slug>/`, holding `plan.md` from [plan-template.md](../assets/plan-template.md) and one `phase-<n>.md` per phase from [phase-template.md](../assets/phase-template.md).

## Process

1. **Phases.** Break the work into phases, each a coherent unit of work that ships and verifies on its own, sized for one executor pass. Let the work decide how many.
2. **Folder.** Reuse the feature folder the source already lives in, or create one.
3. **Fill.** Fill the plan and each phase from their templates, following the inline contracts. Slice the projection across the phases.
4. **Show.** Display the written paths.
5. **Review.** Show the complete plan and its phases with a confidence score (0 to 10, ✓ reasons and ✗ risks). Take feedback, revise the files, and re-show until approved. The score is never written to the plan.

## Test

- `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<feature-slug>/plan.md` exists with one `phase-<n>.md` per phase next to it.
- Every written file satisfies its template's inline contract.
- No `{...}` placeholder is left in any written file.
- The phase projection slices together cover the modify, create, and delete lists.
- A confidence score was reported and written to no file.
