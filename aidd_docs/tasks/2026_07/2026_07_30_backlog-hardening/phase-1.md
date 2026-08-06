---
status: done
---

# Instruction: write-time checks stay file-local

Reordering two Stories, creating an Epic with its first Story, or replacing an
artifact through `supersedes` all pass through an invalid intermediate graph.
The `PostToolUse` hook validates after every write, so it reports those
intermediate states as errors. Verified: moving Story `a` from `order: 1` to
`order: 2` before Story `b` moves out reports `DUPLICATE_ORDER`, and a Story
written before its parent Epic reports `MISSING_TARGET`.

## Architecture projection

```txt
.
├── plugins/aidd-pm/
│   ├── hooks/check-backlog.js                    ✏️ diagnostics carry a scope; --hook keeps file scope only
│   └── skills/00-backlog/
│       ├── actions/07-apply.md                   ✏️ name the intermediate-state contract
│       └── actions/08-verify.md                  ✏️ own the graph-scope findings explicitly
└── scripts/__tests__/check-backlog.test.js       ✏️ cover both scopes
```

## Tasks to do

### `1)` Classify every diagnostic

> Each finding declares whether one file can prove it.

1. Add `scope: "file" | "graph"` to `diagnostic()`.
2. `graph` scope: `MISSING_TARGET`, `MISSING_SOURCE`, `INVALID_PARENT_TYPE`, `INVALID_GOAL_TYPE`, `ACTIVE_SUPERSEDED`, `MIRRORED_RELATION`, `RELATION_CYCLE`, `DUPLICATE_ORDER`.
3. `file` scope: every other code.

### `2)` Filter at the write-time boundary only

> The CLI and the JSON read model keep reporting everything.

1. Report only `file`-scope findings when `--hook` is set.
2. Keep `--json` and the plain CLI unfiltered so `01-inspect` and `08-verify` still see the whole graph.
3. Leave the exit codes as they are: the hook still fails on a `file`-scope error.

### `3)` Say where graph coherence is proven

> The guarantee moves, so the skills must state it.

1. In `07-apply`, record that intermediate writes may leave the graph incoherent and that only the final state is judged.
2. In `08-verify`, state that graph-scope findings are its responsibility.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 1    | Every diagnostic in the JSON read model carries a scope, and no code appears in both lists                |
| 2    | A half-finished reorder and a Story written before its Epic are silent in `--hook` mode and reported in `--json` |
| 2    | A Story with an invalid status is still reported in `--hook` mode                                          |
| 3    | Reading `07-apply` and `08-verify` alone tells which step judges the graph                                 |
