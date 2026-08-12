# Destinations

Every destination starts from the approved learning packet.

| Destination | Use when | Apply |
| ----------- | -------- | ----- |
| memory | durable project fact, convention, or gotcha | write the packet into the matching memory entry |
| ADR | explicit choice with context and consequences | write the packet to `aidd_docs/memory/internal/decisions/<slug>.md` through [ADR template](../assets/adr-template.md) |
| contract | enforceable behavior already owned by an existing project contract file | write the packet by amending that file |
| rule | enforceable coding or agent behavior with no existing owner | send the packet to rule-generate |
| skill | reusable workflow worth a dedicated skill | send the packet to skill-generate |

Reconciliation:

| Value | Apply |
| --- | --- |
| updates | replace the existing entry; do not add contradictions |
| supersedes | replace the entry; link both decision records for an ADR |
| retracts | remove the entry; delete the file only when nothing remains |

Rules:

- If the project memory bank is missing, say what is missing and ask before handing off to project-memory.
- If the destination structure is unclear, ask. Do not invent a new taxonomy.
- Prefer the narrowest destination that can own the lesson.
- The user may choose another destination after seeing the recommendation.
- Write memory, ADRs, and contract amendments directly. Hand off rules and skills.
