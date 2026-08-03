# Modes

| Signal | Mode |
| --- | --- |
| none | interactive; approve each change before writing |
| autonomous with bounds | apply changes inside those bounds |
| autonomous without bounds | apply changes inside the resolved scope |

An unbounded autonomous request passes its resolved scope downstream as the bounded authority. An approval covering a whole change set is that authority for every field it lists.

Every mode stops for a new product decision: what to build, for whom, at what value. Applying a signal the project already declared is not one. A mode also stops for a scope the request did not cover. A refused mutation is reported; it never stops the rest.
