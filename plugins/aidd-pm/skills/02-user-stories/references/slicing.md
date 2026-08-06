# Slicing

Choose the smallest split that preserves observable value.

| Signal | Useful split |
| --- | --- |
| user workflow | one useful step or thin end-to-end path |
| business rules | start with one rule or variation |
| data variation | start with one meaningful data case |
| operations | separate create, view, update, or remove when each is valuable |
| learning-only candidate | separate a Spike |
| several independent outcomes | separate Epics |

Avoid splitting by frontend, backend, database, component, service, or delivery phase.
