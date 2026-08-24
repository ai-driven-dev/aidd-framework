# 03 - Evaluate

Return accessibility findings or confirmed shared rules from observable evidence.

## Input

The requested `assess` or `confirm` mode and evidence from [01-inspect.md](01-inspect.md).

## Output

Fragments conforming to [fragments.md](../references/fragments.md), plus unverified concerns.

## Process

1. **Compare.** Evaluate observed behavior against requirements, pinned conventions, and relevant platform semantics.
2. **Classify.** Return only the fragment type requested by the mode.
   - `assess`: emit each defect with its impact and required behavior.
   - `confirm`: emit a rule only when a canonical shared source or repeated use proves its behavior and scope.
3. **Exclude.** Keep defects out of confirmed rules and missing evidence outside all fragments.
4. **Return.** Return the selected outcome.
   - When no finding or confirmed rule is supported, state that outcome explicitly.

## Test

| Case | Pass |
| --- | --- |
| Finding produced | every required field and observable evidence is present |
| Confirmed shared behavior | a sourced rule and its shared scope are returned |
| Canonical shared component | its owned behavior may be confirmed before repeated use |
| Unsupported claim | it is unverified, not a finding |
| Keyboard or focus defect | the exact control and behavior are named |
| Wrong mode output | a finding never appears as a confirmed rule |
