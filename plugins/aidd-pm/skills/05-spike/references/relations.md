# Relations

Store each relation once, on the artifact that owns it.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

`related_to` lives on the artifact whose path sorts first; the other side carries nothing.

| Field | Meaning on a Spike |
| --- | --- |
| `source` | stable origin |
| `parents` | the Epics, Stories, or Tasks the uncertainty blocks |
| `depends_on` | required predecessors |
| `related_to` | additive relation |
| `supersedes` | replaced terminal Spike |

A Spike carries no other field. It holds neither `order` nor `estimate`: a Spike is bounded by its stop condition, not sized or scheduled.
