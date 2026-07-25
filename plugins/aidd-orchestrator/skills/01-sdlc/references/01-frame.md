# 01 - Frame

Decide whether the source is ready for planning.

```mermaid
---
title: Frame the delivery contract
---
sequenceDiagram
  participant Sdlc as /aidd-orchestrator:01-sdlc
  participant Ticket as /aidd-pm:01-ticket-info
  participant Brainstorm as /aidd-refine:01-brainstorm
  participant Spec as /aidd-pm:04-spec

  opt "A ticket reference exists"
    Sdlc->>Ticket: "Retrieve the source"
    Ticket-->>Sdlc: $ticket
  end
  alt "Objective and acceptance criteria exist"
    Sdlc->>Sdlc: "Keep the source as contract"
  else "Scope is ambiguous"
    Sdlc->>Brainstorm: "Clarify the scope"
    Brainstorm-->>Sdlc: $clarified_scope
    Sdlc->>Spec: "Build the specification"
    Spec-->>Sdlc: $spec
  else "Scope is clear but contract is incomplete"
    Sdlc->>Spec: "Build the specification"
    Spec-->>Sdlc: $spec
  end
```

- `/aidd-orchestrator:01-sdlc` owns the readiness decision.
- A ready contract has an explicit objective and observable acceptance criteria.
- Return `$contract` or `$spec` to `02-deliver`.
