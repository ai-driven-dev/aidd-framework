# 01 - Assess

Assess one Epic or Story through one requested lens.

## Input

One Epic or Story snapshot, its relevant sources, and `role: product|delivery|quality`.

## Output

One evidence-backed assessment report.

## Process

1. **Validate.** Require exactly one supported role and one Epic or Story snapshot.
2. **Inspect.** Read only evidence relevant to the target and selected role.
3. **Assess.** Apply [assessment](../references/assessment.md).
4. **Return.** Emit the report contract without changing any artifact.

## Test

| Case | Pass |
| --- | --- |
| Missing or unknown role | no assessment; supported roles returned |
| Missing or ambiguous target | no assessment; one target question returned |
| Unsupported artifact | no assessment; Epic-or-Story requirement returned |
| Finding | carries every field the report contract requires |
| No finding | inspected sources, `verdict: ready`, and `findings: []` returned |
| Side effect | workspace and external systems unchanged |
