# Relations

Store each relation once, on the artifact that owns it.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

`related_to` lives on the artifact whose path sorts first; the other side carries nothing.

| Field | Meaning on a Task |
| --- | --- |
| `source` | stable origin |
| `parent` | owning Epic, Story, or Defect |
| `depends_on` | required predecessors |
| `related_to` | additive relation |
| `supersedes` | replaced terminal artifact |
| `order` | authorized position among its parent's Tasks |
| `estimate` | authorized effort under the project's scale |
| `work_kind` | `functional` or `technical`, only when the project uses it |

A Task carries no other field. A standalone Task omits `parent`; the intent must be explicit.
