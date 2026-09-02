---
paths:
  - "src/contexts/*/domain/ports/**/*.ts"
  - "src/kernel/ports/**/*.ts"
  - "src/contexts/*/infrastructure/**/*.ts"
  - "src/runtime/**/*.ts"
---

# Ports and Adapters

What belongs in a port file and in an adapter.

## Port

- Interface only, no class
- No default implementation
- No import from infrastructure

## Adapter

- One adapter implements one port
- Name ends with `Adapter`
- I/O and format translation only
- No business logic, no orchestration
- Injected typed as its port
