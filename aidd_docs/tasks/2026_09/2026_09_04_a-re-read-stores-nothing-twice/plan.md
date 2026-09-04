---
status: done
---

# A re-read stores nothing twice

## The defect

`storeNewCandidates` reads the index of what the sink already holds once, before its loop,
and never updates it as it appends. Two candidates for the same turn inside one batch are
therefore both stored: the second is matched only against what an earlier invocation left
behind, never against the line this batch just wrote.

## Why a batch holds the same turn twice

Measured on this project's own transcripts: 53,425 usage lines carry a request id, 28,687
of them distinct, and **350 of those ids appear in more than one file**. One read of one
session hands both copies over as two candidates of the same batch.

## What it actually cost, measured before deciding anything

The sink held 29,699 lines: 339 groups of byte-identical records, 474 extra lines, every one
of them a subagent record.

**No reported figure was ever wrong.** `collapseBilledRequests` groups on
`tool + vendor_id + billed_request_id`, which is exactly what those 339 groups share, so the
report has always merged them:

```
29,699 stored lines  ->  29,207 reported requests
```

So this is storage hygiene, not a correction. The earlier framing of it as figures being
wrong was mine and it was wrong.

## The fix

Make the index live: add each appended record to it. Three lines and a helper.

Rejected: a content-key dedup beside the turn-id one. Measured, 491 extra lines share a
`billed_request_id` against 474 sharing full content — the 17 in between are legitimate
corrections, a re-read of the same billed call with larger counters. A content key stores
those correctly, but it would be a second key answering the one question `turn_id` already
answers, which is the second source of truth this repository refuses elsewhere.

Also rejected: rewriting the 474 lines already in a person's sink. They cost nothing in any
figure, and an append-only sink is not something to rewrite for that.

## Proven end to end

Same real transcripts, same command, two builds:

| Build | Stored lines | Exact-duplicate extra lines |
| --- | --- | --- |
| `origin/next` | 29,171 | 474 |
| this branch | 28,695 | 0 |

The two sinks report the **identical envelope**, byte for byte. Of the 476 lines the fix does
not write, 474 are the duplicates and 2 are smaller readings of a turn whose larger reading is
still stored — the report already discarded those, which is why nothing moved:

```
one turn     base weights [520362, 522612]   fixed [522612]
another      base weights [283285, 283851, 283851]   fixed [283851]
```

## Noted, not changed

`pruneOldDayFiles` keeps the newest 90 **day files**, not 90 calendar days
(`decideTelemetrySinkRetention`). A session re-read after more day files than that would no
longer find its own priors and would store them again. Bounded and deliberate; named here so
the next person reading this file does not have to re-derive it.

## Guards

| Guard | Mutation that kills it |
| --- | --- |
| one line stored when a batch hands the same turn twice | leave the index frozen |
| a larger reading in the same batch still lands as a correction | treat every same-turn candidate as a drop |
| every keyless candidate of one batch is appended | key the keyless records together, on both sides |
