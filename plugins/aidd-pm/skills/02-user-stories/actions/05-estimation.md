# 05 - Estimation

Estimate Stories only when requested or required by the project.

## Input

The assessed Stories and project estimation convention.

## Output

Confirmed estimates, or unchanged Stories.

## Process

1. **Size.** Apply [estimation](../references/estimation.md).
2. **Propose.** Explain the evidence for each estimate.
3. **Confirm.** Record only user- or team-confirmed estimates.

## Test

| Case | Pass |
| --- | --- |
| No project scale | action skipped; no estimate field |
| Insufficient evidence | no estimate unless the user or team supplies one |
| Confirmed estimate | project scale used and comparable evidence or team basis named |
