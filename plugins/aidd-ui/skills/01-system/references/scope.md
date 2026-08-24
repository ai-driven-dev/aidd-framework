# UI system scope

- Store normalized project-relative UI roots.
- Resolve the most specific active scope.
- Stop on equal or unorderable overlaps.
- Permit strict parent and child scopes because the child is more specific.
- Treat shared packages as sources, not inherited scopes.
- Do not infer contract inheritance.
- Block establishment when the id has an active or retired current contract.
- Block establishment when another active contract has an equal or unorderable overlap.
- A retired contract with another id does not own an active scope.
