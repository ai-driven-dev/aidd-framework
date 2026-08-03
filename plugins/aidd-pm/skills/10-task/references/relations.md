# Relations

Store each relation once, on its owner; `related_to` on the artifact whose path sorts first.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

| Field | Meaning on a Task |
| --- | --- |
| `source` | stable origin |
| `parent` | owning Epic, Story, or Defect |
| `depends_on` | required predecessors, one or several |
| `related_to` | additive relation, one or several |
| `supersedes` | replaced artifacts, in a terminal status first; one or several |
| `order` | authorized position among its parent's Tasks |
| `estimate` | authorized effort under the project's scale |
| `work_kind` | `functional` or `technical`, only when the project uses it |

A Task carries no other field. A standalone Task omits `parent`; the intent must be explicit.
