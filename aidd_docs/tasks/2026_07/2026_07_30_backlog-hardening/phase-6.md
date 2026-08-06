---
status: done
---

# Instruction: relation and order semantics recoverable

`MIRRORED_RELATION` (`check-backlog.js:512`) forbids storing `related_to` on both
sides, and `relations.md` names the owner as the "new Story". Nothing in the
files records which one was new, so on any later read no one can tell which side
should carry the field. The rule is enforceable but not recoverable.

`order` uniqueness is keyed per parent for Stories and Tasks, and globally for
Defects (`:529`, key `"defects"`). Ordering N Defects therefore needs N distinct
integers across the whole Defect set. `09-defect` never says so.

## Architecture projection

```txt
.
├── plugins/aidd-pm/
│   ├── hooks/check-backlog.js                          ✏️ name the expected holder in the finding
│   └── skills/
│       ├── 00-backlog/references/fields.md             ✏️ the derivable holder rule
│       ├── 02-user-stories/references/relations.md     ✏️ replace creation order with it
│       └── 09-defect/references/lifecycle.md           ✏️ document the Defect order space
└── scripts/__tests__/check-backlog.test.js             ✏️ cover both
```

## Tasks to do

### `1)` Derive the `related_to` holder from the data

> A rule nobody can apply on a second read is not a rule.

1. Pick the artifact whose project-relative path sorts first as the holder; the checker already sorts paths.
2. Record it in `fields.md` and drop "new Story" from `relations.md`.
3. Report the expected holder inside the `MIRRORED_RELATION` message.

### `2)` Document the Defect order space

> The behaviour exists; only the doc is missing.

1. State in `09-defect` that Defect order is unique across the Defect set, not per parent.
2. Decide and record whether a Defect may carry `estimate`, which the checker currently allows.

## Test acceptance criteria

| Task | Acceptance criteria                                                                    |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | A mirrored `related_to` finding names which artifact must keep the field                |
| 1    | Two agents reading the same pair independently choose the same holder                   |
| 2    | Reading `09-defect` alone predicts the checker's order and estimate behaviour            |
