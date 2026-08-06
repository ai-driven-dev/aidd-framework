# Handoffs

Offer the named capability with what was observed, then stop. Never invoke it silently, never write outside a Task.

| Observed | Capability | Return |
| --- | --- | --- |
| independently deliverable value | User Story | one-way; no Task is created |
| outcome needing several deliverable slices | Epic | one-way |
| observed product mismatch | Defect | one-way |
| uncertainty blocking readiness | Spike | review resumes after its outcome |
| no match | none | report what was observed |
