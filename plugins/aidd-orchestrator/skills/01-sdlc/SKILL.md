---
name: 01-sdlc
description: Autonomously orchestrates a request from framing to a draft pull request, isolating implementation, independent review, and final outcome challenge. Use when the user wants to deliver a change end to end. Not for running one development step.
---

# Skill: sdlc

```mermaid
---
title: SDLC orchestration
---
flowchart LR
  Request["$request"]
  Sdlc["/aidd-orchestrator:01-sdlc"]
  Ready{"Are the contract requirements fulfilled?"}
  Frame["01 Frame"]
  Deliver["02 Deliver"]
  Check["03 Check"]
  PullRequest["$pull_request"]

  Request --> Sdlc
  Sdlc --> Ready
  Ready -- "No, frame the contract." --> Frame
  Ready -- "Yes, deliver it." --> Deliver
  Frame --> Deliver
  Deliver --> Check
  Check -- "Reframe the contract." --> Frame
  Check -- "Iterate on findings." --> Deliver
  Check -- "Ship the candidate." --> PullRequest

  classDef skill fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px
  classDef artifact fill:#DCFCE7,stroke:#16A34A,color:#14532D,stroke-width:2px
  classDef decision fill:#FFEDD5,stroke:#EA580C,color:#7C2D12,stroke-width:2px
  classDef zone fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:2px

  class Sdlc skill
  class Request,PullRequest artifact
  class Ready decision
  class Frame,Deliver,Check zone
```

## References

Read only the current zone's reference before delegating it.

| #   | Reference                                      | Does                                  |
| --- | ---------------------------------------------- | ------------------------------------- |
| 01  | [Frame](references/01-frame.md)                | Resolve a planning-ready contract     |
| 02  | [Deliver](references/02-deliver.md)            | Build and validate a committed change |
| 03  | [Check](references/03-check.md)                | Review independently and open the PR  |

## Transversal rules

- Own routing and verify every handoff against the current reference.
- Treat the canonical plugin addresses in the references as the responsibility map. Verify that each named provider is installed before calling it.
- Work autonomously by default. Make every reversible in-scope decision without asking; ask only when product authority is missing or an external action requires approval.
- Decide in this order: contract and acceptance criteria, project rules, correctness and security, simplicity, then speed.
- Run planning in the orchestrator context. Isolate implementation in `executor` and independent review in `checker`.
- Continue until the branch is clean, every applicable validation is green, the current SHA has passed independent review and the confidence challenge, and a draft pull request exists.
- Stop on `blocked` only after exhausting safe in-scope alternatives. Route contract gaps to `frame` and implementation gaps to `deliver`.
