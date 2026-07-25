# 01 - Frame

Decide whether the source is ready for planning.

```mermaid
---
title: Frame the delivery contract
---
sequenceDiagram
  participant Orchestrator
  participant Ticket as Ticket capability
  participant Brainstorm as Brainstorm capability
  participant Spec as Specification capability

  opt Ticket reference
    Orchestrator->>Ticket: Retrieve source
    Ticket-->>Orchestrator: Ticket
  end
  alt Objective and acceptance criteria exist
    Orchestrator->>Orchestrator: Keep source as contract
  else Scope is ambiguous
    Orchestrator->>Brainstorm: Clarify scope
    Brainstorm-->>Orchestrator: Clarified scope
    Orchestrator->>Spec: Build specification
    Spec-->>Orchestrator: spec.md
  else Scope is clear but contract is incomplete
    Orchestrator->>Spec: Build specification
    Spec-->>Orchestrator: spec.md
  end
```

- The orchestrator owns the readiness decision.
- A ready contract has an explicit objective and observable acceptance criteria.
- Return the source contract or `spec.md` to `02-deliver`.
