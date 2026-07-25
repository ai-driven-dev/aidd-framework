# 01 - Frame

Decide whether the source is ready for planning.

```mermaid
---
title: Frame the delivery contract
---
flowchart TB
  Source[["$source"]]
  Sdlc["/aidd-orchestrator:01-sdlc"]
  TicketDecision{"Ticket reference?"}
  Ticket["/aidd-pm:01-ticket-info"]
  TicketArtifact[["$ticket"]]
  ContractDecision{"Contract ready?"}
  Contract[["$contract"]]
  ScopeDecision{"Scope ambiguous?"}
  Brainstorm["/aidd-refine:01-brainstorm"]
  ClarifiedScope[["$clarified_scope"]]
  Spec["/aidd-pm:04-spec"]
  SpecArtifact[["$spec"]]
  Deliver["02 Deliver"]

  Source --> Sdlc
  Sdlc --> TicketDecision
  TicketDecision -- "yes" --> Ticket
  Ticket --> TicketArtifact
  TicketArtifact --> ContractDecision
  TicketDecision -- "no" --> ContractDecision
  ContractDecision -- "yes" --> Contract
  Contract --> Deliver
  ContractDecision -- "no" --> ScopeDecision
  ScopeDecision -- "yes" --> Brainstorm
  Brainstorm --> ClarifiedScope
  ClarifiedScope --> Spec
  ScopeDecision -- "no" --> Spec
  Spec --> SpecArtifact
  SpecArtifact --> Deliver

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef decision fill:#FFEDD5,stroke:#EA580C,color:#7C2D12,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Sdlc,Ticket,Brainstorm,Spec skill
  class Source,TicketArtifact,Contract,ClarifiedScope,SpecArtifact artifact
  class TicketDecision,ContractDecision,ScopeDecision decision
  class Deliver zone
```

- `/aidd-orchestrator:01-sdlc` owns the readiness decision.
- A ready contract has an explicit objective and observable acceptance criteria.
- Return `$contract` or `$spec` to `02-deliver`.
