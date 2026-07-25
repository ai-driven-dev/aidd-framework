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
  participant Journey as Journey test capability
  participant PullRequest as Pull request capability

  Orchestrator->>Checker: Review contract, plan, and SHA
  Checker->>Review: Review current diff
  Review-->>Checker: review.md and verdict
  opt UI journey exists
    Checker->>Journey: Validate pages
    Journey-->>Checker: Journey report
  end
  Checker-->>Orchestrator: Ship or iterate
  alt Iterate
    Orchestrator->>Orchestrator: Route findings to 02 deliver
  else Ship
    Orchestrator->>Orchestrator: Verify reviewed SHA is current
    Orchestrator->>PullRequest: Open draft request
    PullRequest-->>Orchestrator: Pull request URL
  end
```

- The checker is fresh and read-only.
- Any blocking review finding or failed journey returns `iterate`.
- Only the orchestrator opens the pull request after verifying the reviewed SHA.
