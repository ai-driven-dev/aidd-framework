# 01 - Draft

Draft a PRD from the template, iterating with the user to approval.

## Input

A feature description, and optionally existing user stories.

## Output

One approved PRD draft.

## Process

1. **Parse.** Extract scope, goals, and constraints from the description and any user stories.
2. **Fill.** Draft [prd-template.md](../assets/prd-template.md), keeping every section concise and actionable.
3. **Show.** Present the full draft and wait for explicit approval.
4. **Revise.** Fold corrections and re-show until approved.

## Test

| Case | Pass |
| --- | --- |
| Draft shown | every section `prd-template.md` defines is present, and no other |
| Solution detail proposed | none: no tech-stack, data-model, architecture section, or code |
| Revision requested | draft updates, then re-shown |
| Approved | unchanged draft passed to `finalize` |
