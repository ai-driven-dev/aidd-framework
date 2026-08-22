# 02 - Specify

Define how task priority and interface regions behave as space or input changes.

## Input

The interface proposal and responsive evidence from `01-inspect`.

## Output

Responsive rules per region, each naming the trigger, layout or interaction change, preserved priority, and overflow behavior.

## Process

1. **Prioritize.** Keep the primary task and required context available under constraint.
2. **Adapt.** Decide applicable stacking, collapse, wrapping, persistence, density, overflow, touch, and overlay behavior.
3. **Reuse.** Apply existing breakpoints and primitives; justify the exact gap before proposing an extension.
4. **State.** Describe behavior by available space and input capability, not arbitrary device models.

## Test

| Case | Pass |
| --- | --- |
| Rule produced | trigger, behavior change, preserved priority, and overflow handling are explicit |
| Existing breakpoint fits | no new breakpoint is introduced |
| New breakpoint proposed | an evidenced layout failure at existing breakpoints justifies it |
| Table or overlay adapts | interaction and content access remain explicit |
