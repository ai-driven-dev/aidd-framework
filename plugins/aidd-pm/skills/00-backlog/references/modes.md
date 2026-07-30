# Modes

| Signal | Mode |
| --- | --- |
| none | interactive; approve changes before writing |
| explicit autonomous request with bounded authority | apply changes inside those bounds |
| autonomous request without bounds | ask for authority before writing |

Every mode stops for a new product decision, conflict, unsupported transition, or expanded scope.
