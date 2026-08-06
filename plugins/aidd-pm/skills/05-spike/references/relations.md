# Relations

Store each relation once, on its owner; `related_to` on the artifact whose path sorts first.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

| Field | Meaning on a Spike |
| --- | --- |
| `source` | stable origin |
| `parents` | the persisted Epics, Stories, or Tasks the uncertainty blocks, one or several |
| `depends_on` | required predecessors, one or several |
| `related_to` | additive relation, one or several |
| `supersedes` | replaced Spikes, in a terminal status first; one or several |

A Spike carries no other field. It holds neither `order` nor `estimate`: a Spike is bounded by its stop condition, not sized or scheduled.
