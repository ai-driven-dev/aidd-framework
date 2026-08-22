# 02 - Assess

Turn observed experience defects into prioritized findings.

## Input

The evidence inventory from `01-inspect`.

## Output

A coverage note and findings ordered `critical`, `warning`, then `minor`, each with evidence, impact, and a proportional recommendation.

## Process

1. **Evaluate.** Check only applicable hierarchy, task clarity, density, affordance, feedback, consistency, states, responsive behavior, accessibility, and visual coherence.
2. **Prioritize.** Assign severity using [findings.md](../references/findings.md).
3. **Recommend.** State the required experience behavior without component code, CSS, or unrelated refactoring.
4. **Report.** Return the coverage note before the result.
   - No defects were observed: state that explicitly instead of inventing a finding.

## Test

| Case | Pass |
| --- | --- |
| Finding reported | it includes observable evidence, user impact, severity, and a bounded recommendation |
| Aesthetic preference | it is omitted unless an explicit requirement or convention supports it |
| Technical issue | it appears only when it causes an observable experience consequence |
| No finding | covered dimensions and remaining evidence gaps are still named |
| Recommendation | it contains behavior and acceptance evidence, not implementation code |
