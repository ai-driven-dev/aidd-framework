# 01 - PRD

Parse the feature input, draft a structured PRD from the template, validate with the user, then save the file under `aidd_docs/tasks/`.

## Input

A feature description (required), and optionally existing user stories (ids or text) to anchor the PRD.

## Output

The saved PRD at `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>-<feature_name>-prd.md`, carrying all eight sections.

## Process

1. **Parse.** Extract the feature scope, goals, and constraints from the description and any user stories.
2. **Draft.** Fill `@../assets/prd-template.md` with its eight sections: overview, problem statement, goals, non-goals, user stories, acceptance criteria, dependencies, open questions.
3. **Validate.** Show the full draft, wait for explicit approval, and re-show after each revision.
4. **Save.** Write the approved PRD to its dated path, creating the month directory when missing.

## Test

- The PRD file exists on disk after the action completes.
- It contains the eight headings: Overview, Problem Statement, Goals, Non-Goals, User Stories, Acceptance Criteria, Dependencies, Open Questions.
- It has no solution detail: no tech-stack, data-model, or architecture section, no `## Implementation` heading, and no source code.
