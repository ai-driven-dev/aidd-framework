# Relations

Store each relation once, on the artifact that owns it.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

`related_to` lives on the artifact whose path sorts first; the other side carries nothing.

| Field | Meaning on an Epic |
| --- | --- |
| `source` | stable origin |
| `goal` | the product goal or Product Brief the outcome serves, outside the backlog |
| `depends_on` | required predecessors |
| `related_to` | additive relation |
| `supersedes` | replaced terminal artifact |
| `order` | authorized position across the Epic set, not within a parent |
| `estimate` | authorized rough size, relative to other Epics |

An Epic carries no other field. It holds no `parent`: children identify their Epic.

`goal` and `source` never hold the same reference: `goal` is the outcome's alignment, `source` its origin.
