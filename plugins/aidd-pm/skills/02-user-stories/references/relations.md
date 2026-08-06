# Relations

Store each relation once, on its owner; `related_to` on the artifact whose path sorts first.

Inverse links are never stored: `children`, `blocked_by`, `superseded_by`. Readers derive them.

| Field | Meaning on a Story |
| --- | --- |
| `source` | stable origin |
| `parent` | owning Epic |
| `depends_on` | required predecessors, one or several |
| `related_to` | additive relation, one or several |
| `supersedes` | replaced artifacts, in a terminal status first; one or several |
| `order` | authorized position among its parent's Stories |
| `estimate` | authorized effort under the project's scale |

A Story carries no other field. A standalone Story omits `parent`; the intent must be explicit. When a blocker concludes, preserve its relation and reassess affected gaps, estimate, order, and parent Epic. A child status never completes an Epic without success evidence.
