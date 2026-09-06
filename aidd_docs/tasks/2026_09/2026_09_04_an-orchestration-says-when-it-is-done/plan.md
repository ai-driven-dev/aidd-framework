---
status: done
---

# An orchestration says when it is done

## Why now

The reader stopped closing a flow at a `turn_end` — *"a `turn_end` is a pause, not the end of
an orchestration"*. What closes one now is a `step_end` naming the orchestrating skill, or
the next orchestrating `step_start`, or, failing both, the journal's own last witnessed
moment.

The three orchestrators emit no `step_end`. So every flow falls to the last of those three,
and an orchestration that never says it is done goes on owning everything the session did
afterwards. The mechanism exists and has exactly one user: `aidd-dev:01-plan`.

## The change

Each orchestrating skill declares its own end where its work actually finishes:

| Skill | Declared once |
| --- | --- |
| `aidd-orchestrator:01-sdlc` | the draft pull request exists |
| `aidd-orchestrator:02-backlog` | the flow reached `done` |
| `aidd-orchestrator:00-async-dev` | the sub-flow it committed to ran its last action |

Markdown only. No hook change, no reader change: `step-ends.cjs` already reads the marker out
of a tool call's own arguments, and the reader already treats a `step_end` naming the flow's
own skill as its closer.

## Guards

`aidd-telemetry-step-end.test.js` already held one guard over this tree — every skill that
declares an end declares it in the form the hook reads. It says nothing about a skill that
declares none, which is exactly the new failure.

The second guard reads the reader's own `ORCHESTRATING_SKILLS` and requires each
plugin-qualified name in it to declare an end the hook resolves to that same name. A fourth
orchestrator added to that set is covered without this test being told.

| Guard | Mutation that kills it |
| --- | --- |
| every skill that opens a flow says when it is over | drop the marker from one orchestrator (1 failure) |
| the end it declares is its own | point one orchestrator's marker at another skill (2 failures) |

Gates: 369 repository script tests, 0 broken links, skill argument hints clean, catalogs and
README counts regenerate to no diff.

## The limit this does not remove

The reader compares the two names exactly. A host that names a skill by its folder alone
writes `01-sdlc` into `step_start` while this marker says `aidd-orchestrator:01-sdlc`, and
the two do not match — so on Cursor and Codex these declarations still close nothing.
`aidd-dev:01-plan`'s own marker has carried that limit since it shipped. Making the
comparison read both spellings belongs where the comparison lives, in
`flow-attribution.ts` and `step-attribution.ts`, not in a skill's prose.
