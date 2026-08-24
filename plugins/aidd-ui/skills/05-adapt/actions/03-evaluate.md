# 03 - Evaluate

Return adaptation findings or confirmed shared rules from observed behavior.

## Input

The requested `assess` or `confirm` mode and evidence from [01-inspect.md](01-inspect.md).

## Output

Fragments conforming to [fragments.md](../references/fragments.md), plus unverified contexts.

## Process

1. **Compare.** Evaluate observed transformations against requirements, task priority, and pinned conventions.
2. **Classify.** Return only the fragment type requested by the mode.
   - `assess`: emit each defect with its impact and required behavior.
   - `confirm`: emit a rule only when a canonical shared source or repeated use proves its trigger, transformation, and scope.
3. **Exclude.** Keep defects out of confirmed rules and untested contexts outside all fragments.
4. **Return.** Return the selected outcome.
   - When no finding or confirmed rule is supported, state that outcome explicitly.

## Test

| Case | Pass |
| --- | --- |
| Finding produced | every required field and observable evidence is present |
| Confirmed transformation | its trigger, behavior, scope, and source are returned |
| Canonical shared layout | its owned transformation may be confirmed before repeated use |
| Existing primitive solves it | the acceptance condition references that primitive |
| Context untested | no defect is claimed |
| Wrong mode output | a finding never appears as a confirmed rule |
