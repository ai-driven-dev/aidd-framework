# 03 - Check

Review the candidate in a fresh context and route the verdict.

```mermaid
---
title: Check independently
---
sequenceDiagram
  participant Orchestrator
  participant Checker
  participant Review as Review capability
  participant Todo as Todo capability
  participant ExecutorA as Executor
  participant ExecutorN as Executor
  participant PullRequest as Pull request capability

  Orchestrator->>Checker: Review contract, plan, and SHA
  Checker->>Review: Review current diff
  Review-->>Checker: review.md and verdict
  Checker-->>Orchestrator: Ship or iterate
  alt Iterate
    Orchestrator->>Todo: Dispatch independent findings
    par Finding A
      Todo->>ExecutorA: Implement finding
    and Finding N
      Todo->>ExecutorN: Implement finding
    end
    ExecutorA-->>Todo: Fix result
    ExecutorN-->>Todo: Fix result
    Todo-->>Orchestrator: Consolidated results
    Orchestrator->>Orchestrator: Route results to 02 deliver
  else Ship
    Orchestrator->>Orchestrator: Verify reviewed SHA is current
    Orchestrator->>PullRequest: Open draft request
    PullRequest-->>Orchestrator: Pull request URL
  end
```

- The checker is fresh and read-only.
- Any blocking review finding returns `iterate`.
- Dispatch only independent findings through the todo capability, one executor per finding in parallel.
- Re-enter `02-deliver` to integrate, validate, commit, and run the final E2E gate.
- Only the orchestrator opens the pull request after verifying the reviewed SHA.
