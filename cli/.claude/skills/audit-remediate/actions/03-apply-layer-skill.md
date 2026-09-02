# 03 - Apply Layer Skill

Apply the authoritative layer skill to each violation found in action 02. The layer skill is
the sole authority for what constitutes correct code in the target layer.

## Inputs

- `violation-list` (required) - numbered list from action 02
- `layer-skill` (required) - the context skill to apply (e.g. `tools`, `translate`, `distribution`, `framework`)

## Outputs

For each item in the violation list:
- The fix applied, referencing the layer skill rule that mandated it
- OR a "confirmed-clean" verdict if re-inspection finds no violation

## Process

1. For each violation in the violation list (work item by item, never in bulk):
   a. Re-read the relevant section of the layer skill's SKILL.md.
   b. Apply the minimal fix that satisfies the rule. Do not refactor beyond the stated violation.
   c. Confirm the fix compiles: run `pnpm typecheck` after each file edit.
   d. Log the fix: "Fixed \<file\>: \<violation\> — resolved per \<layer-skill\> transversal rule '\<rule\>'."
2. If a violation cannot be fixed without changing observable behavior, stop and record:
   "Skipped \<violation\>: fix requires behavior change — escalate."
3. If the layer skill's rule is incorrect or incomplete for the real case:
   a. Stop. Do not apply a wrong fix.
   b. Fix the layer skill first (edit its SKILL.md or action file).
   c. Rollback any partial changes to the target layer: `git restore <target-file>`.
   d. Retry from action 02 with the improved skill.
   e. Log the skill improvement.

## Behavior-preservation invariant

Every change in this action must be behavior-preserving. Tests and the golden baseline
(captured in action 01) are the proof. If a fix causes a test to fail, it is not
behavior-preserving — rollback and re-approach.

## Test

Run `pnpm typecheck` after each file. Confirm the exit code is 0. Do not proceed to action 04
until all per-file typechecks pass.
