---
paths:
  - "src/application/use-cases/**/*.ts"
---

# Orchestration

How a use case that spans several areas depends on them.

- Depend on entry points, not parts
- One dependency per area crossed
- A dozen collaborators means reaching inside
- Steps stay inside their own area
