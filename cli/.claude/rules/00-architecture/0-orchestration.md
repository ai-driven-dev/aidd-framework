---
paths:
  - "src/contexts/*/application/**/*.ts"
---

# Orchestration

A use case that spans several areas depends on their entry points, one dependency per area
crossed. A constructor listing many collaborators is the signal that the orchestration is
reaching inside the areas instead of asking them.

- At most four other use cases per use case. `orchestrator-deps.arch.test.ts` counts both the
  ones injected in the constructor, optional included, and the ones a method instantiates with
  `new XUseCase(...)`, deduped by class name.
- The steps of an area stay inside it. Needing a second collaborator from an area already
  crossed means that area's entry point is missing, not that the limit is too low.
- A use case over the limit is baselined with the count its reason was written around, so an
  admitted orchestrator cannot grow from five collaborators to fifteen in silence.
