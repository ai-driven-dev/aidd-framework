---
paths:
  - "src/domain/ports/**/*.ts"
  - "src/infrastructure/adapters/**/*.ts"
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
