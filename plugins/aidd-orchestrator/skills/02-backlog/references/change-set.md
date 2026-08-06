# Change Set

| Field | Value |
| --- | --- |
| identity | stable id, URL, or project-relative path; `new` before creation |
| artifact | Epic, Story, Task, Spike, or Defect |
| operation | create, update, transition, relate, order, estimate, or cancel |
| owner | capability that writes it |
| before | current value or absent |
| after | proposed value or absent |
| evidence | source, decision, or finding that supports it |

Keep mutations separate when they need separate approval. Never persist the change set.
