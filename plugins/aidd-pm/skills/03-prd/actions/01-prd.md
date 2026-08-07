# 01 - PRD

Parse the feature input, draft a structured PRD from the template, validate with the user, then save the file under `aidd_docs/tasks/`.

## Input

A feature description (required), and optionally existing user stories (ids or text) to anchor the PRD.

## Output

The saved PRD at `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>-<feature_name>-prd.md`, carrying all eight sections. After writing, report its stable identity, changed fields as `before -> after`, affected relations, and verification result. Without a write, state that no persisted change occurred.

## Process

1. **Parse.** Extract the feature scope, goals, and constraints from the description and any user stories.
2. **Draft.** Fill [prd-template.md](../assets/prd-template.md) with its eight sections: overview, problem statement, goals, non-goals, user stories, acceptance criteria, dependencies, open questions.
3. **Validate.** Show the full draft, wait for explicit approval, and re-show after each revision.
4. **Save.** Write the approved PRD to its dated path, creating the month directory when missing.

## Test

| Case | Pass |
| --- | --- |
| The action completes | the PRD file exists on disk |
| The file is read back | it holds the eight headings of `assets/prd-template.md` and no other |
| Solution detail was proposed | no tech-stack, data-model, architecture section, `## Implementation` heading, or source code was written |
| A write happened | the result reports the stable identity, `before -> after` fields, affected relations, and verification result |
| No write happened | the result states that no persisted change occurred |
