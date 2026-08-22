# 01 - Inspect

Collect the evidence needed to review the interface in its actual context.

## Input

An existing screen, flow, rendered interface, screenshot, or implementation location.

## Output

An evidence inventory covering the user task, observable interface, applicable states and viewports, and confirmed project conventions.

## Process

1. **Locate.** Resolve the relevant workspace, interface entry points, and requirement source.
2. **Observe.** Use rendered behavior when available and implementation evidence for states that cannot be reached directly.
3. **Confirm.** Check memory claims against current repository evidence and report contradictions.
   - No interface or requirement can be observed: stop with the missing evidence.

## Test

| Case | Pass |
| --- | --- |
| Evidence inventory | each item names a source path, viewport observation, or supplied artifact |
| Memory claim used | current implementation confirms it or drift is reported |
| No UI evidence | no experience claim is fabricated |
