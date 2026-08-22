# 05 - Validate

Verify and consolidate the experience decisions.

## Input

The frame, structure, interface direction, and unresolved risks.

## Output

A corrected experience decision set with intent, structure, system reuse and delta, interactions and states, responsive behavior, accessibility requirements, decisions, and open risks.

## Process

1. **Check.** Evaluate only the states, constrained-space behavior, input methods, accessibility needs, and content pressures that apply to this interface.
2. **Trace.** Confirm every meaningful decision has evidence and every hard requirement has a decision or an open risk.
3. **Remove.** Delete decisions based on unstated context, unmeasured compliance claims, copied source, component markup, CSS declarations, and framework syntax; cite source paths and observable behavior instead.
4. **Correct.** Resolve contradictions within the decision set without changing product intent.
5. **Return.** Keep the result implementation-ready but free of production component code, CSS, and framework recipes.

## Test

| Case | Pass |
| --- | --- |
| Hard requirement | it maps to a decision or a named open risk |
| Applicable state | its trigger, feedback, and recovery behavior are explicit |
| Existing convention | the decision set names its concrete source or reports drift |
| Accessibility behavior | it is an observable requirement, not an unsupported compliance claim |
| Unstated context | it remains an open risk and drives no decision |
| Final output | application source and project memory read back unchanged |
