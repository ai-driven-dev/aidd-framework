---
status: done
---

# Instruction: one home per enforced rule

The status vocabulary exists in six places: `STATUSES` (`check-backlog.js:6`) and
the five `references/lifecycle.md`. Field ownership exists in three: `FORBIDDEN`
(`:23`), `02-user-stories/references/relations.md`, and a sentence in
`10-task/references/persistence.md`. They agree today, and nothing keeps them
equal. This is the one place where the design breaks its own rule: one owner per
rule.

The checker stays the authority because it is executable. Each artifact skill
keeps its own field table and is tested against it. No skill reads another
skill's files: a shared reference would need a path, and the same tree ships flat
or marketplace, so no path is portable.

## Architecture projection

```txt
.
├── plugins/aidd-pm/skills/
│   ├── 02-user-stories/references/relations.md   ✏️ the Story's own fields
│   ├── 05-spike/references/relations.md          ✅ the Spike's own fields
│   ├── 07-epic/references/relations.md           ✅ the Epic's own fields
│   ├── 09-defect/references/relations.md         ✅ the Defect's own fields
│   ├── 10-task/references/relations.md           ✅ the Task's own fields
│   └── {05-spike,07-epic,10-task}/references/persistence.md   ✏️ drop the field claims they duplicated
└── scripts/__tests__/check-backlog.test.js       ✏️ conformance and isolation
```

## Tasks to do

### `1)` Test the status vocabulary against the checker

> Five tables, one source of truth.

1. Read each `references/lifecycle.md` and collect its backticked statuses per artifact type.
2. Fail when a documented status is absent from `STATUSES`, or a `STATUSES` entry is undocumented.

### `2)` Give each artifact its own field table

> Ownership is per artifact, and a skill stays readable alone.

1. Give every artifact skill a `references/relations.md` stating the fields it owns and the inverse links nobody stores.
2. Remove the field claims the `persistence.md` files duplicated.
3. Derive the forbidden set from the documented ownership and fail when it differs from `FORBIDDEN`.

### `3)` Forbid reading another skill's files

> A cross-skill path cannot survive both build layouts.

1. Replace the checker links with its name, since a hook script does not live under `skills/`.
2. Fail the suite on any link that escapes its own skill.

## Test acceptance criteria

| Task | Acceptance criteria                                                                     |
| ---- | --------------------------------------------------------------------------------------- |
| 1    | Adding a status to one `lifecycle.md` without touching the checker fails the suite       |
| 2    | Adding a field to one `relations.md` without touching the checker fails the suite        |
| 2    | Each artifact skill states its own fields, and no file states another artifact's          |
| 3    | A link escaping its skill fails the suite                                                |
