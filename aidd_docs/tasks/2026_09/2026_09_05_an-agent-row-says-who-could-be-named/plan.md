---
status: done
---

# An agent row says who could be named

## The defect

`agentKeyOf` read `agent_name === undefined` as the main thread, whatever the tool:

```ts
return record.agent_name === undefined ? NO_AGENT : record.agent_name;
```

Only Claude Code's reader ever sets that field. `claude-code-transcript.ts` derives it from
`isSidechain` and `attributionAgent`; the Codex, Copilot and OpenCode readers set it nowhere,
and their route declarations say so — `toolStatedStep: false` was already there, an agent
flag was not.

So on those three tools every record was reported as the main thread. Not a small error: it
is **100% of the axis**, asserted on no evidence at all. The contract said so out loud and
called it correct: *"On every tool but Claude Code the field is never set at all, so that one
row carries the whole period, which is the truth for a route that names no subagents."*

The same file already states the right rule twelve lines below, for `step`: *"its absence
here yields no `step` at all … rather than asserting 'no skill ran'."*

## The change

A record with no agent name joins one of two rows, and only the tool's own declaration says
which.

| Row | `attribution` | Means |
| --- | --- | --- |
| named | `tool-stated` | the tool named the agent |
| no name | `main-thread` | a tool that names agents said this belongs to none of them |
| no name | `not-stated` | a tool whose route never names one |

`TelemetryRouteSupply` gains `agentName`, declared per route beside `toolStatedStep`, and
checked against real captures by the same honesty guard: `telemetry-route-supply.unit.test.ts`
observes what each capture actually yields, so a route claiming an agent name its reader
never sets fails there.

The declaration is read rather than the record because the record cannot carry the absence:
a tool that never names an agent writes exactly what a main-thread line writes.

`accumulate`'s per-record parameters became a `RecordContext` in the same commit — nine
positional arguments in a fixed order is a call nobody checks by eye, and the linter's own
function-length rule made the point at the ninth.

## What this does not fix

A line marked as a subagent's that carries no agent name still reads as the main thread.
Measured 2026-09-05 across 1,852 transcripts: **157 of 122,637 subagent lines name no agent,
0.07%**. Closing it needs a new field on the record, which no record already stored could
ever gain (`storeNewCandidates` freezes a record's field set at first sight — see
`2026_09_05_a-prompt-axis-says-what-it-cannot-name`). Stated on `CostReportAgentRow` rather
than captured.

## Guards

| Guard | Mutation that killed it |
| --- | --- |
| a tool that names agents gets a `main-thread` row | always answer `not-stated` — 3 |
| a tool whose route never names one gets `not-stated` | always answer `main-thread`, the old reading — 3 |
| a *declared* route that names no agent reads the same as no route at all | accept any declared route — 1 |
| the two silences are two rows, never merged | (covered by the two above) |
| every agent row still sums to the period total | (reconciliation test, 3 rows) |
| a route may not claim an agent name its reader never sets | make codex declare `agentName: true` — 1 |
| both renderings name which silence a row is | collapse the label to "the main thread" — 1 display, 1 artefact |

## Proof

Two binaries against one copy of the sink, `--days 30`, 30,222 requests on both. This corpus
is almost entirely Claude Code, so it can barely show the fault:

| `by_agent` row | `aee5721b` | this branch |
| --- | --- | --- |
| the main thread | 9,002 | 9,001 |
| a tool that names no agent | — | **1** |

That one record is the sink's only Codex request. The magnitude is not in this corpus — for
a Codex-only reader the same change moves the whole axis — so the guards are the proof and
the one record is the demonstration that the path runs end to end. All eleven breakdowns
reconcile to 30,222 on both.

## Bundle

593.8 KB against a 593 KB budget. Raised to 596, the same 2.2 KB headroom the `by_prompt`
raise left. The comment in `check-bundle-size.mjs` records the raise and its measurement, as
the two before it do.
