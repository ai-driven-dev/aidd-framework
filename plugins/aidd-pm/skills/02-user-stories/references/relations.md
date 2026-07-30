# Relations

Store each relation once. Native trackers or readers derive inverse links.

| Field | Owner | Meaning |
| --- | --- | --- |
| `source` | derived artifact | stable origin |
| `parent` | Story | owning Epic |
| `depends_on` | dependent Story | required predecessors |
| `related_to` | new Story | additive relation |
| `supersedes` | replacement Story | replaced terminal artifact |
| `order`, `estimate` | Story | authorized backlog values |

When a blocker concludes, preserve its relation and reassess affected gaps, estimate, order, and parent Epic. A child status never completes an Epic without success evidence.
