# 01 - Inspect

Collect the accessibility evidence for the target interface.

## Input

An interface proposal or existing interface plus its relevant project area.

## Output

The confirmed accessibility bar, interaction model, semantic structure, states, and evidence gaps.

## Process

1. **Read.** Check project memory, requirements, shared components, and interface implementation for an existing accessibility bar.
2. **Observe.** Inspect rendered keyboard, focus, naming, state announcement, contrast, touch, and reduced-motion behavior when available.
3. **Confirm.** Support each claim with repository or runtime evidence and report memory drift.
4. **Bound.** Mark unavailable behavior as unverified rather than inferring compliance.

## Test

| Case | Pass |
| --- | --- |
| Existing bar | its source and implementation evidence are named |
| Runtime unavailable | behavior that requires runtime observation is marked unverified |
| Memory conflicts | repository evidence wins and memory remains unchanged |
