---
status: done
---

# Every row kind arrives in any order

## Why

A re-read appends, so one session's lines sit in different orders on two machines and nothing
a consumer does controls it. The report is supposed to be blind to that, and
`cost-report.unit.test.ts` already checks it — with four records and a single reversal.

Four records cannot cover what has been added since. Two axes now mix key kinds inside one
`Map`, which is exactly where insertion order leaks into output:

| Axis | Row | Key |
| --- | --- | --- |
| `by_flow` | the journal witnessed it | the `FlowInterval` object |
| `by_flow` | only the tool named it | the skill's name, a string |
| `by_flow` | joined neither | a symbol |
| `by_agent` | the tool named the agent | the agent's name |
| `by_agent` | the main thread | a symbol |
| `by_agent` | the tool never names one | a second symbol |

Rows are ranked by size and ties are broken on the row's own key. A tie-break that forgets
part of the key, or a survivor picked as `group[0]`, answers differently for the same records
in a different order — and nothing failed when either was broken.

## Verified before it was written

30,222 records of a live sink, shuffled within every day file with a seeded shuffle, produced
a **byte-identical** report to the unshuffled run (`md5` equal). Three consecutive unshuffled
runs were byte-identical too, and all eleven `--axis` artefacts were stable across runs. The
property holds at scale; this is the guard that keeps it.

## The test

`cost-report-order.property.unit.test.ts`, fast-check over 300 permutations of a fixture
carrying every row kind once: both flow kinds and the remainder, all three agent
attributions, a named prompt and one that named none, two tools, a pair with identical
figures that only a tie-break can order, and two records sharing one `billed_request_id` so
`pickDeterministically` is actually reached.

A second test asserts the fixture exercises what the property is about — a permutation of
records that produce one kind of row proves nothing about mixed keys.

| Guard | Mutation that killed it |
| --- | --- |
| the agent tie-break keeps the row's key | return `""` — 1 |
| the flow tie-break keeps the row's key | return `""` — 1 |
| a superseded group's survivor does not depend on arrival | `pickDeterministically` returns `candidates[0]` — 1 |

The third survived the first version of this fixture, which had no two records sharing a
`billed_request_id` — the function was never reached. Adding the pair is what made the guard
real, and the coverage test is what stops that regressing quietly.
