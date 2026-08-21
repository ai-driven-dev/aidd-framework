---
paths:
  - "src/**/*.ts"
---

# Dependency Direction

Which layer may import which.

```mermaid
flowchart RL
  infrastructure --> application --> domain
```

- Imports point inward only
- Domain imports nothing outward
- Application imports ports, never adapters
- Infrastructure implements, never orchestrates
