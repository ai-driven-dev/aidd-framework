# 03 - Assess

Report responsive defects that change task completion or content access.

## Input

The existing interface evidence from `01-inspect`.

## Output

Prioritized findings with the triggering context, observed behavior, user consequence, and bounded recommendation, plus untested contexts.

## Process

1. **Compare.** Evaluate observed behavior against requirements and confirmed responsive conventions.
2. **Trace.** Identify changes in task priority, information access, action reachability, overflow, or touch behavior.
3. **Recommend.** Reuse an existing layout or breakpoint solution when evidence supports it.
4. **Report.** Keep untested contexts distinct from the result.
   - No defects were observed: state that explicitly instead of inventing a finding.

## Test

| Case | Pass |
| --- | --- |
| Finding reported | it names the trigger, behavior, consequence, and recommendation |
| Existing breakpoint solves it | the recommendation names that breakpoint or primitive |
| Context untested | no defect is claimed from absence of evidence |
| No defect observed | the result says so and retains any untested contexts |
