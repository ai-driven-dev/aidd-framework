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
  participant Commit as Commit capability
  participant Test as E2E test capability

  Orchestrator->>Plan: Build plan from contract
  Plan-->>Orchestrator: plan.md
  Orchestrator->>Executor: Deliver plan and findings
  Executor->>Implement: Implement plan or fixes
  Implement-->>Executor: Candidate
  Executor->>Assert: Validate candidate
  Assert-->>Executor: Verdict
  opt Delivery leaves uncommitted changes
    Executor->>Commit: Commit remaining changes
    Commit-->>Executor: Commit SHA
  end
  opt User journey is required
    Executor->>Test: Run final E2E journey
    Test-->>Executor: Journey report
  end
  Executor-->>Orchestrator: Clean candidate SHA
```

- The orchestrator owns `plan.md`; the executor never rewrites it.
- The executor implements and self-validates. It does not perform the independent review.
- Run E2E only after implementation, assertions, and commits are complete. A failure re-enters delivery before one final E2E run.
- Return only a clean candidate with green validation to `03-check`.
