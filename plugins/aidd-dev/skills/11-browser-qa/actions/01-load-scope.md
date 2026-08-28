# 01 - Load Scope

Lock the smallest defensible browser QA scope before execution.

## Input

Plan path or implementation artifact.

## Output

- 1 locked browser happy path, 
- a bounded set of sourced browser edge cases, 
- a source label,
- a resolved evidence folder.

## Process

1. **Resolve.** the requested feature from its plan.
2. **Filter.** Keep only Happy path and Edge case sections where every task's Mermaid actor is `browser` (Ignore non-browser, mixed-channel, and unmarked scenario sections without displaying them).
3. **Lock.** Lock 1 browser happy path from the explicit user journey, then the filtered plan Test Scope, then browser-observable acceptance criteria in the implementation artifact. 
   - Ask one concise question only when those sources conflict or expose multiple browser journeys.
4. **Collect.** Include every filtered planned edge case + candidates from explicit browser validation, error, empty-state, permission, boundary, or recovery branches already visible in the implementation artifact. 
   - Search directly related browser tests only when the filtered plan contains no edge case.
5. **Bound.** Deduplicate candidates against planned edges. Keep at least 3 proposed edges, ranked by user impact, browser observability, determinism, and proximity to the requested journey.
6. **Decide.** Automatically include a proposed edge only when it is deterministic, browser-observable, in scope, and non-destructive. Require a decision only for an external or destructive action.
7. **Validate.** Reject a scenario without a source, trigger, browser-observable outcome, or executable teardown when it changes state.
8. **Locate.** Use the existing AIDD feature folder when the source belongs to one. Otherwise use `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<feature-slug>/`.
9.  **Show.** Emit `Happy path: locked (<source>)` and one compact `Edge case | Source | Decision` table. Do not repeat scenario steps.
