# 04 - Assess

Determine each Story's readiness and blockers.

## Input

The Story drafts.

## Output

The Story documents with their status, and a Spike for any blocking unknown.

## Process

1. **Quality.** Apply [readiness](../references/readiness.md) to every Story.
2. **Unknowns.** Apply [handoffs](../references/handoffs.md) and [relations](../references/relations.md).
3. **Reshape.** Return an oversized or non-valuable Story to slicing.
4. **Status.** Use `ready` only when every readiness criterion passes. Otherwise keep `proposed` and list only readiness blockers.
5. **Feedback.** Show changed or `proposed` Stories and ask about the highest gap; otherwise continue.

## Test

| Case | Pass |
| --- | --- |
| Ready | every readiness row passes; no blocker left to show |
| Proposed | each failed row maps to one sourced gap |
| Unapproved blocker | Story remains; Spike offered; related artifacts unchanged |
| Approved blocker | Spike `parents` names the Story; no inverse field is mirrored |
| Unchanged ready set | no intermediate output |
| Output | no assessment summary, empty field, tooling gap, or skipped-route report |
