---
status: pending
---

# Instruction: Rewrite the documentation and the skills

The last phase, because until now the documentation described a tree that had not moved.

Two files are rewritten rather than corrected: `codebase-map.md` (32 structural references) and
`memory/architecture.md` (16). The ten skills are replaced rather than updated: they encode the
layer taxonomy, answering "how do I create an adapter" when the first question becomes "which
context does this belong to".

Three target invariants also become rules here, now that they are true.

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── ARCHITECTURE.md              ✏️ modify (four contexts, the chain, the two ownership regimes)
    ├── aidd_docs/memory/
    │   ├── codebase-map.md          ✏️ modify (rewritten; the map test keeps it honest)
    │   └── architecture.md          ✏️ modify (rewritten)
    ├── .claude/skills/
    │   ├── {adapter,capability,command,domain-model,feature,format,tool,use-case}/  ❌ delete
    │   ├── {translate,tools,distribution,framework}/  ✅ create (one per context)
    │   └── {test,audit-remediate}/   ✏️ modify (cross-cutting, kept)
    └── .claude/rules/
        ├── 00-architecture/0-contexts.md  ✅ create (the chain, the kernel, one public entry)
        └── 01-standards/1-exports.md      ✏️ modify (barrels forbidden, context entry allowed)
```

## User Journey

```mermaid
flowchart TD
  A[A contributor adds something] --> B[Which context does it serve?]
  B --> C[That context's skill says what to write and where]
  C --> D[The rules say what may not be done]
  D --> E[The architecture tests refuse what slipped through]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    the code has moved => the documentation can describe what exists: 5: system
  section Happy path
    read codebase-map => every directory under src is listed: 5: system
    read ARCHITECTURE.md => every command it presents exists: 5: system
    follow a context skill to add a format => it lands in the right place: 5: system
  section Edge case - a stale map
    a directory is added without updating the map => the map test fails: 1: system
  section Teardown
    the three target invariants are rules => the plan leaves nothing in a task folder: 5: system
```

## Tasks to do

### `1)` Rewrite the two memory files

1. `codebase-map.md` describes the four contexts, the kernel, presentation and runtime. The
   `codebase-map` architecture test keeps it honest from then on.
2. `architecture.md` keeps its File Ownership section and drops what described the layer tree.

### `2)` Replace the skills

1. One per context: `translate`, `tools`, `distribution`, `framework`. Each answers what goes in,
   how, and how it is tested — relying on the invariants rather than repeating them.
2. Keep `test` and `audit-remediate`, which cut across.
3. The launcher subject — locate and execute, never embed — joins the skill of the context that
   carries kanban and telemetry.

### `3)` Promote the three target invariants

1. The chain `framework → translate → tools → kernel` plus `framework → distribution`.
2. The kernel imports no context and carries no business logic.
3. One public entry per context; nothing imports an interior.

### `4)` Settle the barrel conflict

1. `1-exports.md` forbids every `index.ts`. The context entry is a boundary, not a convenience.
   Distinguish the two, and align the biome `override` with the rule.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1    | The `codebase-map` and `docs-do-not-lie` tests pass without a baseline |
| 2    | Ten skills become six; each context skill answers where a new artifact goes |
| 3    | The three invariants are rules, and each has a test or a lint rule behind it |
| 4    | A context entry is allowed, a convenience barrel is refused, and the rule says which is which |
| all  | Nothing in this plan remains described only in a task folder |
