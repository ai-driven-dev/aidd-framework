---
status: done
---

# An identity names the work it already did

## The defect

`person_id` is stamped onto a record in `stampProvenanceAndTool`, at the moment the record
is stored. So what a period reports for `by_person` depends on **when the identity was
declared relative to when each record was read**, not on the work itself.

Two reads of the same sink, with the same `identity.json`, answer differently depending on
the order those two things happened in. That is the determinism defect, and it is the one
`by_person`'s 0% on a real machine actually is: 29,207 requests, every one of them read by
this machine's own `aidd`, none of them nameable by the person who ran them.

It also contradicts this repository's own rule — *store what was observed, derive what was
judged*. Which person a record belongs to is a judgement, and it is re-judgeable.

## Measured before designing

The fallback is only sound if a sink can hold exactly one person's records. It can:

| Question | Answer |
| --- | --- |
| Callers of `TelemetrySink.appendRecord` | one, `read-local-cost-use-case.ts:537` |
| `provenance` values across 29,699 stored lines | `local-read`, all of them |
| Distinct `person_id` values | none — the field is absent on every line |
| `sink_schema_version` values | `2`, all of them |

Nothing else writes the sink, so every record in it was read by this machine's own reader.

## The change

`resolvePerson` gains a fourth `PersonResolution`, `"this-machine"`: the record carried no
identifier of its own, and this machine has declared an identity. Deterministic given the
pair (sink, `identity.json`), and retroactive — declaring once names the whole history.

Kept apart from `"mapped"` rather than folded into it, because the two are not the same
fact: `"mapped"` is the record naming a person this identity claims, `"this-machine"` is
this identity claiming a record that named nobody. An attribution says its own strength.

`"none"` stays reachable and keeps its meaning: no identifier on the record **and** no
identity declared. A machine that never declared one reports exactly as it does today.

Store-time stamping stays. The field is what an export carries to a destination, so a
record must be able to name its own person without the reader's `identity.json` beside it.

## Guards

| Guard | Mutation that kills it |
| --- | --- |
| an unstamped record resolves to this machine's declared identity | drop the fallback branch |
| an unstamped record with no identity declared still resolves `"none"` | fall back before the null-identity check |
| a stamped identifier this identity does not claim still resolves `"unresolved"` | fall back before the match check |
| the row carries the identity's own evidence, like a mapped row | return an empty `identities` |
| every renderer names the fourth value rather than silently reading it as "no identifier" | add the value without touching `personLabel` |

## Envelope

`cost_report_version` `14` -> `15`: `by_person`'s `resolution` gains a value a consumer
switching exhaustively on the three previous ones does not know.

## Proven end to end

Built binary, the real sink copied read-only into a sandbox, one `identity.json` written in
a sandboxed `HOME`, same command on both builds:

| Build | `by_person` |
| --- | --- |
| `origin/next` | `no identity — nobody opted in` — 29,207 requests, 0 named |
| this branch | `A Person` — 29,207 requests, **100% named** |

Same sink, same identity file, same period. Nothing was re-read and no record was rewritten:
the difference is entirely that the judgement now happens where it can be re-made.

## Found while making the change

`personRows` selected its output with one filter per resolution and concatenated them, so a
`"this-machine"` row summed into no group and vanished — the rows existed, the totals they
belonged to stayed, and the breakdown silently stopped reconciling by omission. `personLabel`
had the same shape one layer up: an if-chain whose fallback printed any unnamed resolution as
"nobody opted in", the exact opposite of what the row said.

Both are now written over the whole union as a `Record<PersonResolution, …>`, so the next
value added fails to compile in both places instead of disappearing in one and being
mislabelled in the other.
