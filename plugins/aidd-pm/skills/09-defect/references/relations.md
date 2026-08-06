# Relations

Store each relation once, on its owner; `related_to` on the artifact whose path sorts first.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

| Field | Meaning on a Defect |
| --- | --- |
| `source` | stable origin, report, or observation |
| `depends_on` | required predecessors, one or several |
| `related_to` | the affected artifacts, one or several |
| `supersedes` | replaced Defects, in a terminal status first; one or several |
| `order` | authorized position across the Defect set; product impact and project policy decide it, not severity alone |
| `estimate` | authorized effort under the project's scale |

A Defect carries no other field. It has no `parent`: resolution work is a Task whose `parent` is the Defect.
