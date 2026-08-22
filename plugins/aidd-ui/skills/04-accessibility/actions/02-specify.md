# 02 - Specify

Define the accessibility behavior the proposed interface must preserve.

## Input

The interface proposal and accessibility evidence from `01-inspect`.

## Output

Applicable requirements, each naming the user interaction, required behavior, and observable acceptance condition.

## Process

1. **Select.** Keep applicable semantics, keyboard reachability, focus behavior, accessible naming, contrast, error handling, labels, touch targets, announcements, and reduced motion.
2. **Align.** Reuse confirmed project patterns and name any required extension.
3. **Write.** Express each requirement as observable behavior without prescribing component code.

## Test

| Case | Pass |
| --- | --- |
| Requirement produced | it names an interaction and an observable acceptance condition |
| Existing convention fits | the requirement reuses it by source |
| Concern does not apply | no boilerplate requirement is emitted for it |
