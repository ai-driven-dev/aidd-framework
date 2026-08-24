# UI system lifecycle

## Delta states

```text
draft -> approved -> verified -> promoted
draft | approved -> rejected
draft | approved | verified -> superseded
```

- Editing an approved delta creates a new draft.
- Verification records one implementation commit and its evidence.
- Promotion requires a verified delta against the current base.
- A promoted delta is historical, not a feature dependency.

## Revisions

- The current contract is `aidd_docs/ui/systems/<system-id>.md`.
- Its prior body is `.history/<system-id>@<revision>.md`.
- Resolve current first, then immutable history.
- Never edit a history file.
