---
status: pending
---

# Milestone 3: The figures leave the machine

Everything so far stays on one laptop. Pricing, and any aggregation across people, needs
them somewhere else.

## Why last

Nothing above needs it, and it is the only milestone that can leak. Sending data before
milestone 2 would mean shipping figures nobody has proven trustworthy, to a place they
cannot be recalled from.

## What it holds

| # | What | Effort |
| --- | --- | --- |
| #662 | **Upload out of band, never at the session's expense.** Nothing on a critical path, no added latency, and a failure to send costs nothing measured. | a day |
| #655 | **Redact again on the upload path.** Redaction at rest is not redaction in flight. `user.email` appeared on 52 records of 52 in one capture. | half a day |
| #660 | **Anonymous and named measurement, both.** A team that will not identify people still wants totals. | half a day |
| #661 | **Resolve one person across tools and machines.** The join that makes per-person real, and the one most likely to be wrong quietly. | a day |
| #656 | **Report per person, team and epic.** What the upload was for. | after the above |

## Done when

- A figure computed on a laptop appears in the service that prices it, with the same value.
- Nothing carrying a person's identity leaves without that being a stated, reversible choice.
- The upload failing is invisible to whoever is working.

## Not here, and deliberately

Pricing itself. The rates live in the governor, and this repository's job ends at emitting
figures complete enough to price.
