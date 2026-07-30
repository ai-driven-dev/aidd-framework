# Task Quality

A Task is bounded delivery work without independent user value.

## Qualification

| Input | Result |
| --- | --- |
| several deliverable outcomes | Epic |
| independently useful behavior | User Story |
| delivery work serving a parent or goal | Task |
| bounded uncertainty | Spike |
| observed mismatch | Defect |
| same delivery outcome | existing Task |

## Readiness

| Criterion | Ready when |
| --- | --- |
| Outcome | one verifiable delivery result |
| Scope | boundaries prevent hidden work |
| Done | completion can be evidenced |
| Ownership | parent is known or standalone intent is explicit |
| Relations | dependencies and source are linked or absent |
| Classification | `work_kind` is set only when the project uses it |

A Task may remain `proposed` with gaps. `work_kind` is optionally `functional` or `technical`; it never changes the qualification above.
