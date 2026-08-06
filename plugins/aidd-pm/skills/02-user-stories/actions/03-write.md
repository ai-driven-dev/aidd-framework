# 03 - Write

Write each approved candidate as a testable User Story.

## Input

The approved candidate list.

## Output

One Story draft per candidate.

## Process

1. **State.** Fill [User Story template](../assets/user-story-template.md) with the actor, need, and outcome.
2. **Accept.** Add sourced observable conditions. Ask or omit unknown behavior; use examples or Gherkin only when clearer.
3. **Relate.** Add known metadata from [relations](../references/relations.md).
4. **Clean.** Remove placeholders and empty optional content.
5. **Feedback.** Show the complete Story set, ask what should change, and fold corrections.

## Test

| Case | Pass |
| --- | --- |
| Count | exactly one Story per approved candidate |
| Structure | actor, need, outcome, and at least one observable acceptance condition |
| Traceability | actor, need, outcome, and acceptance come from the source or a confirmed decision |
| Acceptance | contains product behavior only; backlog relations stay metadata |
| Source metadata | absent unless backed by a stable id, URL, or project-relative path |
| Feedback | complete set shown; no write; response ends with one open question |
