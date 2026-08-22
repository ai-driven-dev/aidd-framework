# 03 - Assess

Report observable accessibility defects and evidence gaps.

## Input

The existing interface evidence from `01-inspect`.

## Output

Prioritized findings, each with evidence, affected interaction, user consequence, and a bounded recommendation, plus unverified concerns.

## Process

1. **Compare.** Evaluate observed behavior against explicit requirements, confirmed project conventions, and relevant platform semantics.
2. **Prioritize.** Order findings by blocked access, material friction, then bounded inconsistency.
3. **Recommend.** State the behavior that must change without prescribing an unrelated refactor.
4. **Report.** Keep missing evidence distinct from the result.
   - No defects were observed: state that explicitly instead of inventing a finding.

## Test

| Case | Pass |
| --- | --- |
| Finding reported | evidence, affected interaction, consequence, and recommendation are present |
| Unsupported claim | it is excluded from findings and listed as unverified |
| Keyboard or focus defect | the exact control and observed behavior are named |
| No defect observed | the result says so and retains any unverified concerns |
