# 01 - Challenge

Rethink prior work and verify correctness against an agreed plan, then emit a structured findings report.

## Input

- The work to review: the last answer, specific files, a plan, or a commit range.
- The agreed reference to judge it against: a plan, a spec, or stated requirements. Without one, judge against stated user intent.

## Output

The findings report following [report-template.md](../assets/report-template.md): a confidence percentage plus the Correctness, Deal breakers, and Suggestions sections.

## Process

1. **Align.** Read the work and line it up against the agreed reference.
2. **Challenge.** Challenge own assumptions and the user's decisions.
3. **Trust.** Answer internally:
   - "Am I proud of the work delivered?"
   - "Am I confident in every consequential choice that was made?"
   - "Will the user be satisfied with the real end-to-end outcome?"
4. **Scan.** Scan for edge cases, errors, gaps, duplications, and inconsistencies.
5. **Classify.** Classify each finding as Correctness, Deal breaker, or Suggestion.
6. **Score.** Score confidence per the rubric in [confidence-rubric.md](../references/confidence-rubric.md).
7. **Emit.** Fill [report-template.md](../assets/report-template.md) verbatim and emit it.

## Test

- The report has a confidence percentage and the Correctness, Deal breakers, and Suggestions sections.
- The Deal breakers section is non-empty only when confidence is below 75%.
- A negative or uncertain trust answer produces a deal breaker and confidence below 75%.
