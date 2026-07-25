# 01 - Frame

Decide whether the source is ready for planning.

```mermaid
---
title: Frame the delivery contract
---
flowchart LR
  Source["$source"]
  ChallengeFindings["$challenge_findings"]
  Sdlc["/aidd-orchestrator:01-sdlc"]
  TicketDecision{"Is a ticket attached?"}
  Ticket["/aidd-pm:01-ticket-info"]
  TicketArtifact["$ticket"]
  ContractDecision{"Are the contract requirements fulfilled?"}
  Contract["$contract"]
  ScopeDecision{"Is the scope ambiguous?"}
  Brainstorm["/aidd-refine:01-brainstorm"]
  ClarifiedScope["$clarified_scope"]
  Spec["/aidd-pm:04-spec"]
  SpecArtifact["$spec"]
  Deliver["02 Deliver"]

  Source --> Sdlc
  ChallengeFindings -- "Use these findings when reframing." --> Sdlc
  Sdlc --> TicketDecision
  TicketDecision -- "Yes, retrieve it." --> Ticket
  Ticket --> TicketArtifact
  TicketArtifact --> ContractDecision
  TicketDecision -- "No, use the source." --> ContractDecision
  ContractDecision -- "Yes, continue." --> Contract
  Contract --> Deliver
  ContractDecision -- "No, frame it." --> ScopeDecision
  ScopeDecision -- "Yes, clarify it." --> Brainstorm
  Brainstorm --> ClarifiedScope
  ClarifiedScope --> Spec
  ScopeDecision -- "No, write the specification." --> Spec
  Spec --> SpecArtifact
  SpecArtifact --> Deliver

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef decision fill:#FFEDD5,stroke:#EA580C,color:#7C2D12,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Sdlc,Ticket,Brainstorm,Spec skill
  class Source,ChallengeFindings,TicketArtifact,Contract,ClarifiedScope,SpecArtifact artifact
  class TicketDecision,ContractDecision,ScopeDecision decision
  class Deliver zone
```

- `/aidd-orchestrator:01-sdlc` owns the readiness decision.
- A ready contract has an explicit objective and observable acceptance criteria.
- When the confidence challenge exposes a need gap, use `$challenge_findings` to refine the contract before planning again.
- Return `$contract` or `$spec` to `02-deliver`.
