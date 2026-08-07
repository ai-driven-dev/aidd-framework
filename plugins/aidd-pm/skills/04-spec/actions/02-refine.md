# 02 - Refine

Rewrite an existing spec in place to address review findings.

## Input

The path to the current spec, and the findings to address, a list or free text.

## Output

The refined spec at the same path, with the changes applied and any residual `TBD` questions noted. Report its stable identity, changed fields as `before -> after`, affected relations, and verification result. Without a write, state that no persisted change occurred.

## Process

1. **Load.** Read the spec and the findings.
2. **Map.** Pair each finding with the section it touches.
3. **Rewrite.** Apply each finding in place: clarify wording, add missing fields, remove invalid claims. Leave untouched sections as they are.
4. **Gaps.** Replace any field still unanswered with `TBD: <precise question>`. Never guess.
5. **Check.** Confirm every section the validator requires is present, then overwrite the spec at its path.

## Test

| Case | Pass |
| --- | --- |
| The action completes | the spec still exists at its path with every section required by [spec-validator.yml](../assets/spec-validator.yml) |
| A finding is resolved | the spec changed at the section it names |
| A finding cannot be resolved | an explicit `TBD: <question>` marks it in place |
| A write happened | the result reports the stable identity, `before -> after` fields, affected relations, and verification result |
| No write happened | the result states that no persisted change occurred |
