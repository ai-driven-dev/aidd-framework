# Assessment

## Lenses

| Role | Inspect |
| --- | --- |
| product | outcome, audience, value, scope, evidence, and product assumptions |
| delivery | feasibility, dependencies, interfaces, constraints, operability, and delivery unknowns |
| quality | acceptance observability, states, edge cases, failure modes, and verification gaps |

Do not decide priority, solution, scope, estimate, or acceptance on the user's behalf.

## Report

Return `target`, `snapshot`, `role`, `verdict`, `sources`, `findings`, and `questions`.

| Verdict | Condition |
| --- | --- |
| `ready` | no unresolved blocking or material finding |
| `revise` | supported amendments can resolve the findings |
| `blocked` | missing evidence or a decision prevents assessment or revision |

Each finding has a stable id, impact (`blocking`, `material`, or `minor`), one claim, a source pointer, and the shortest decisive excerpt or direct observation. Add a proposed amendment only when the evidence entails it.

Each question names its finding id, the missing decision or evidence, and what the answer unlocks.
