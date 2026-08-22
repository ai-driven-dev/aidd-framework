# 02 - Verify

Check that engineering can implement the required experience without guessing essential behavior.

## Input

The written `ui.md` and its confirmed source decisions.

## Output

A verified UI contract, or the exact missing decisions and blocked handoff when they cannot be confirmed.

## Process

1. **Cover.** Check every source requirement and confirmed decision against the contract.
2. **Challenge.** Test task flow, applicable states, system reuse and delta, constrained-space behavior, accessibility, destructive actions, and error recovery for ambiguity.
   - An essential decision is missing: return it for confirmation; revise through `01-compile` when resolved, or report the blocked handoff and stop when unresolved.
3. **Remove.** On the verified path, delete implementation prescriptions that do not express an experience constraint.
4. **Report.** On the verified path, name the contract and any non-blocking implementation freedom left open.

## Test

| Case | Pass |
| --- | --- |
| Required state | its trigger, feedback, and recovery behavior are implementable without guessing |
| Responsive requirement | trigger and resulting region or interaction behavior are explicit |
| Accessibility requirement | observable acceptance behavior is explicit |
| Source decision | it appears in the contract or is identified as a blocking gap |
| Decision remains unresolved | the handoff is blocked and no value is invented |
| Verified contract | application source and project memory read back unchanged |
