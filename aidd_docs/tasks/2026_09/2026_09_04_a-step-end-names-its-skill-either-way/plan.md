---
status: done
---

# A step end names its skill either way

## The limit two changes just declared

Both the flow closer and the step closer compared the two names with `===`. `skill-detection.cjs`
has two capture routes and each writes a different spelling:

| Route | Hosts | Writes |
| --- | --- | --- |
| `skillNameFromArgument` | Claude Code, Copilot | `aidd-dev:01-plan` |
| `skillNameFromSkillFileRead` | Cursor, Codex | `01-plan` |

The end is not captured by either: it is read out of the text a skill echoes, and a skill
always names itself in full, because that is what it knows itself as. So on Cursor and Codex
a step opened as `01-plan` met an end named `aidd-dev:01-plan`, matched nothing, and fell
back to the next opener as if the skill had never said it was done.

`aidd-dev:01-plan` has carried that since `step_end` shipped. The orchestrators' own markers
would have carried it from birth.

## The change

One predicate, `namesTheSameSkill`, used by both readers. Equal outright, or equal once a
`plugin:` prefix comes off — and only when one side carries no plugin at all. Two qualified
names that disagree stay two skills: `aidd-dev:01-plan` and `aidd-pm:01-plan` are never
folded together.

The cost is stated where the function lives: an unqualified `01-plan` closes whichever
`01-plan` is open, whatever plugin it came from. The host threw the plugin away before this
code saw the line, and no reader can put it back. It is the same limit `ORCHESTRATING_SKILLS`
already names for a project whose own skill shares a directory name with an orchestrator.

## Guards

| Guard | Mutation that kills it |
| --- | --- |
| a bare opener is closed by a full-name end, in a step and in a flow | compare with `===` again (4 failures) |
| two qualified names that disagree are never folded | drop the both-qualified check (3 failures) |
| the prefix actually comes off at the colon | return the name unchanged (2 failures) |

Gates: 3434 tests / 308 files, `tsc`, `biome ci`, knip, jscpd, bundle within budget.

## Not proven by the sink

This machine's own journals were written by Claude Code, which spells the name in full both
times, so the corpus cannot separate the two rules. The guards are the proof, and the hosts
this fixes are Cursor and Codex.
