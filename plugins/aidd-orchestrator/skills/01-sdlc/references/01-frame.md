# 01 - Frame

Decide whether the source is ready for planning.

```mermaid
---
title: Frame the delivery contract
---
sequenceDiagram
  participant Sdlc as /sdlc
  participant Ticket as /ticket-info
  participant Brainstorm as /brainstorm
  participant Spec as /spec

  opt $ticket_reference exists
    Sdlc->>Ticket: Retrieve $ticket_reference
    Ticket-->>Sdlc: $ticket
  end
  alt $source has objective and acceptance criteria
    Sdlc->>Sdlc: Keep $source as $contract
  else $scope is ambiguous
    Sdlc->>Brainstorm: Clarify $scope
    Brainstorm-->>Sdlc: $clarified_scope
    Sdlc->>Spec: Build $spec from $clarified_scope
    Spec-->>Sdlc: $spec
  else $scope is clear but $contract is incomplete
    Sdlc->>Spec: Build $spec from $source
    Spec-->>Sdlc: $spec
  end
```

- `/sdlc` owns the readiness decision.
- A ready contract has an explicit objective and observable acceptance criteria.
- Return `$contract` or `$spec` to `02-deliver`.
