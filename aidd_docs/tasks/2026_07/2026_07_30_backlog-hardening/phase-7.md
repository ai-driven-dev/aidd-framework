---
status: done
---

# Instruction: residual coherence

Small gaps found while reading the worktree. None blocks the others, and each is
a one-line divergence between what the repo says and what it contains.

## Architecture projection

```txt
.
├── aidd_docs/
│   ├── README.md                                       ✏️ 10-task missing from the marketplace table
│   └── CONTRIBUTING.md                                 ✏️ name the Test table shape
├── docs/ARCHITECTURE.md                                ✏️ skills no longer ship a README
├── lefthook.yml                                        ✏️ node guard and glob on the checker job
└── plugins/aidd-pm/skills/
    ├── 00-backlog/references/events.md                 ✏️ rule on the four unrouted skills
    ├── 01-ticket-info/actions/01-ticket-info.md         ✏️ Test table
    ├── 03-prd/actions/01-prd.md                        ✏️ Test table
    └── 04-spec/actions/{01-build,02-refine}.md         ✏️ Test table
```

## Tasks to do

### `1)` Close the doc divergences

> Each is verifiable against the tree.

1. Add `10-task` to the `aidd-pm` row of the marketplace table in `aidd_docs/README.md`.
2. Remove the per-skill `README.md` line from the plugin anatomy in `docs/ARCHITECTURE.md`; no skill ships one.
3. Record the `| Case | Pass |` table in `aidd_docs/CONTRIBUTING.md`, since it is already the de facto action contract.

### `2)` Fix the pre-commit job

> Every other node job in that file degrades gracefully.

1. Guard `backlog-checker-tests` with `command -v node`.
2. Add a glob so it runs only when the checker or its tests change.

### `3)` Leave the four legacy actions alone

> They belong to skills this work does not touch.

1. `01-ticket-info`, `03-prd`, `04-spec/01-build` and `04-spec/02-refine` keep their bullet-list `## Test`. Converting them would widen this change into skills it has no reason to open.

### `4)` Rule on the unrouted capabilities

> An open question, not a defect.

1. Decide whether `01-ticket-info`, `03-prd`, `04-spec` and `06-product-brief` are deliberately outside the backlog graph.
2. Record the answer in `events.md`, as a route or as an explicit exclusion.

### `5)` Rule on three design choices

> Each was defensible as it stood; none was written down as a choice.

1. Test placement: keep `scripts/__tests__/`, and record why in `docs/ARCHITECTURE.md`. The build copies `hooks/` recursively into user projects, so a test folder inside a plugin would ship to them.
2. Epic ordering: grant Epics `order` and `estimate`. Agile practice estimates Epics relative to each other and orders them by business value; denying both was a limitation, not a design.
3. Collapse the three advocate agents. The read-only contract already lives in `08-three-amigos`; the agent files only repeated it, at the cost of three near-identical entries in every session's agent registry.

## Test acceptance criteria

| Task | Acceptance criteria                                                                |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | Every documented skill list matches the plugin manifest                             |
| 1    | No doc claims a file shape the tree does not have                                   |
| 2    | A contributor without node gets a skip, not a failed commit                          |
| 3    | The four legacy actions are byte-identical to their state before this work           |
| 4    | `events.md` accounts for every skill in the plugin, by route or by exclusion         |
| 5    | Each of the three choices is either recorded with its reason or reversed             |
