# Relations

Store each relation once, on the artifact that owns it.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

`related_to` lives on the artifact whose path sorts first; the other side carries nothing.

| Field | Meaning on a Defect |
| --- | --- |
| `source` | stable origin, report, or observation |
| `depends_on` | required predecessors |
| `related_to` | the affected artifacts |
| `supersedes` | replaced terminal Defect |
| `order` | authorized position across the Defect set, not within a parent |
| `estimate` | authorized effort under the project's scale |

A Defect carries no other field. It has no `parent`: resolution work is a Task whose `parent` is the Defect.
