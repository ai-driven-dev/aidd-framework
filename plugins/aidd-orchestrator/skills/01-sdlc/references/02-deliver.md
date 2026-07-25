# 02 - Deliver

Produce a validated candidate from the contract.

```mermaid
---
title: Deliver the candidate
---
sequenceDiagram
  participant Orchestrator
  participant Plan as Planning capability
  participant Executor
  participant Implement as Implementation capability
  participant Assert as Assertion capability
  participant Test as Test capability
  participant Commit as Commit capability

  Orchestrator->>Plan: Build plan from contract
  Plan-->>Orchestrator: plan.md
  Orchestrator->>Executor: Deliver plan and findings
  Executor->>Implement: Implement plan or fixes
  Implement-->>Executor: Candidate
  Executor->>Assert: Validate candidate
  Assert-->>Executor: Verdict
  opt User journey is required
    Executor->>Test: Validate journey
    Test-->>Executor: Journey report
  end
  opt Delivery leaves uncommitted changes
    Executor->>Commit: Commit remaining changes
    Commit-->>Executor: Commit SHA
  end
  Executor-->>Orchestrator: Clean candidate SHA
```

- The orchestrator owns `plan.md`; the executor never rewrites it.
- The executor implements and self-validates. It does not perform the independent review.
- Return only a clean candidate with green validation to `03-check`.
