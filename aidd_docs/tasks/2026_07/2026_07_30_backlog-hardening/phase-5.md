---
status: done
---

# Instruction: state what is not enforced

Two guarantees read stronger than they are.

The five `lifecycle.md` publish a `May move to` column, but the checker is
stateless per file and never sees a transition: `proposed` straight to `done`
passes. Only `08-verify` holds both the before and the after, so only it can
judge a transition.

`01-inspect` runs the checker on local files unconditionally, and `02-triage`
searches that read model for an existing match. On a tracker-backed project the
read model is empty, so the duplicate guard is blind while its test still reads
`Existing work | one existing identity selected`.

## Architecture projection

```txt
.
└── plugins/aidd-pm/skills/00-backlog/
    ├── actions/01-inspect.md       ✏️ distinguish no backlog from a backlog held elsewhere
    ├── actions/02-triage.md        ✏️ name what the comparison can and cannot see
    ├── actions/08-verify.md        ✏️ own transition validity
    └── references/supports.md      ✏️ the local read model is partial when another support is authoritative
```

## Tasks to do

### `1)` Make `08-verify` judge transitions

> It already compares every authorized mutation to the applied result.

1. Add a step: reject a transition absent from the owning artifact's lifecycle.
2. Add the case to its test table.

### `2)` Separate an empty backlog from an invisible one

> A tracker-backed project must not look like a fresh one.

1. In `01-inspect`, resolve which supports hold artifacts before reading the local graph, and report the local read model as partial when another support is authoritative.
2. In `02-triage`, state that duplicate detection covers only the supports actually read, and ask when it cannot cover the authoritative one.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                |
| ---- | -------------------------------------------------------------------------------------------------- |
| 1    | An artifact moved to a status its lifecycle forbids fails verification                              |
| 2    | A project whose backlog lives in a tracker is reported as partially read, never as an empty backlog |
| 2    | Triage names the supports it compared before proposing a new artifact                               |
