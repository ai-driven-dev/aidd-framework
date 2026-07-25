# 03 - Implement

Build the plan's code by spawning the `executor` agent to run the implementation recipe, which loops the phases, drives status, and validates. Mandatory.

## Input

The plan path from `02` (required), and on an `iterate` loop-back the review findings to hand over as a fix list (optional).

## Output

The plan reaches `status: implemented`, every phase `done`, validation green. Or it stops at `status: blocked` when a human is needed.

## Process

1. **Discover.** Find the phased plan implementation capability at runtime by description.
2. **Implement.** Spawn the `executor` agent and brief it to run that capability on `plan_path`. The agent branches, codes every phase, commits the code and the status transitions, and validates.
3. **Iterate.** After an `iterate` verdict, spawn `executor` again with the findings as a fix list. It codes them against the current diff, then asserts and validates, gating like a phase: done only when it passes. Never edit the plan; the loop fixes the diff, not the plan.
4. **Resolve.** Read the plan's final `status`.
   - `implemented`: the step is done.
   - `blocked`: a human-only condition stopped the run. Do not continue. Escalate to a human.

## Test

- The plan `status` is `implemented`, or `blocked` when a human-only condition stopped it.
- When the plan is `implemented`, every phase reads `status: done`.
- When the plan is `implemented`, the validation commands return exit code 0.
