# Product Brief Input

Resolve one approved `product-brief.md`:

| Status | Use |
| --- | --- |
| `current` | consume it |
| `superseded` | follow `superseded_by`; stop if missing |
| absent | consume as a legacy current brief |

Then map it into the PRD:

| Product Brief | PRD |
| --- | --- |
| Opening, Opportunity | Overview, Problem Statement |
| Audience and Context, Product Bet | User Stories, Goals |
| Boundaries | Non-Goals |
| Success | Goals, Acceptance Criteria |
| Evidence and Assumptions, Open Decisions | Dependencies, Open Questions |

Preserve assumptions as open questions or dependencies, never requirements. Ignore its optional visual when it adds no requirement evidence.
