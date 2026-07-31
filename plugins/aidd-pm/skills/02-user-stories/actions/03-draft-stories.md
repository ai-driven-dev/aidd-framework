# 03 - Draft stories

Write each candidate as a full INVEST story with acceptance criteria and a pragmatic functional Definition of Done.

## Input

The confirmed candidate list from `02-split-epic`.

## Output

One drafted story per candidate, each filling [user-story-template.md](../assets/user-story-template.md): the As-a/I-want/So-that statement, Gherkin acceptance criteria, and a functional DoD.

## Process

1. **Frame.** Write the As-a/I-want/So-that statement, naming the role, the action, and the outcome.
2. **Criteria.** Write Gherkin scenarios covering at least one nominal case and one error or boundary case.
3. **Done.** Write the functional DoD per [rating.md](../references/rating.md): observable, user-facing conditions only, never technical delivery steps.
4. **Check INVEST.** Verify each story against the six criteria in [rating.md](../references/rating.md). Reshape any story that fails.
5. **Fill.** Render each story into [user-story-template.md](../assets/user-story-template.md), leaving estimation fields for `04-estimate-impact`.

## Test

- Each story has an As-a/I-want/So-that statement and at least one Gherkin scenario.
- Each story has a functional DoD whose bullets are user-facing, with no technical delivery step.
- Each story satisfies all six INVEST criteria.
