# 02 - Refine

Rewrite an existing spec in place to address review findings.

## Input

The path to the current spec, and the findings to address, a list or free text.

## Output

The refined spec at the same path, with the changes applied and any residual `TBD` questions noted.

## Process

1. **Load.** Read the spec and the findings.
2. **Map.** Pair each finding with the section it touches.
3. **Rewrite.** Apply each finding in place: clarify wording, add missing fields, remove invalid claims. Leave untouched sections as they are.
4. **Gaps.** Replace any field still unanswered with `TBD: <precise question>`. Never guess.
5. **Check.** Confirm every section the validator requires is present, then overwrite the spec at its path.

## Test

- The spec still exists at its path and holds every required section in `@../assets/spec-validator.yml`.
- Every finding is reflected by a change, or by an explicit `TBD: <question>` when it cannot be resolved.
