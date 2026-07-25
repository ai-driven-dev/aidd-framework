# 01 - Frame

## Behavior

Start from `$source` only. Resolve a ticket when the source references one. Use the source directly when it is planning-ready. Otherwise clarify only the intent that can change what is built, then formalize the missing contract requirements. Hand the resulting contract to Deliver.

```mermaid
---
title: Frame the delivery contract
---
flowchart TD
  subgraph SourceStage["Resolve the source"]
    direction TB
    Source["$source"]
    Ticket["/aidd-pm:01-ticket-info"]
    ResolvedSource["$resolved_source"]
  end

  subgraph FrameStage["Frame the contract when needed"]
    direction TB
    Brainstorm["/aidd-refine:01-brainstorm"]
    Spec["/aidd-pm:04-spec"]
  end

  subgraph HandoffStage["Hand off the contract"]
    direction TB
    Contract["$contract"]
    Deliver["02 Deliver"]
  end

  Source -- "When the source references a ticket, resolve it." --> Ticket
  Source -- "Otherwise, use the source as provided." --> ResolvedSource
  Ticket --> ResolvedSource
  ResolvedSource -- "When it is planning-ready, continue directly." --> Contract
  ResolvedSource -- "When intent can change what is built, clarify it." --> Brainstorm
  ResolvedSource -- "When only contract requirements are missing, formalize them." --> Spec
  Brainstorm --> Spec
  Spec --> Contract
  Contract --> Deliver

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Ticket,Brainstorm,Spec skill
  class Source,ResolvedSource,Contract artifact
  class Deliver zone
```
