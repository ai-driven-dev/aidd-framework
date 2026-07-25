# 03 - Check

Review the candidate in a fresh context and route the verdict.

```mermaid
---
title: Check independently
---
sequenceDiagram
  participant Sdlc as /aidd-orchestrator:01-sdlc
  participant Checker as @aidd-dev:checker
  participant Review as /aidd-dev:05-review
  participant Todo as /aidd-dev:10-todo
  participant ExecutorA as @aidd-dev:executor A
  participant ExecutorN as @aidd-dev:executor N
  participant PullRequest as /aidd-vcs:02-pull-request

  Sdlc->>Checker: "Review the contract, plan, and candidate"
  Checker->>Review: "Review the current diff"
  Review-->>Checker: $review, $verdict
  Checker-->>Sdlc: $verdict
  alt "Iterate"
    Sdlc->>Todo: "Dispatch independent findings"
    par "Finding A"
      Todo->>ExecutorA: "Implement finding A"
    and "Finding N"
      Todo->>ExecutorN: "Implement finding N"
    end
    ExecutorA-->>Todo: $fix_a
    ExecutorN-->>Todo: $fix_n
    Todo-->>Sdlc: $fixes
    Sdlc->>Sdlc: "Route fixes to 02 Deliver"
  else "Ship"
    Sdlc->>Sdlc: "Verify the reviewed SHA is current"
    Sdlc->>PullRequest: "Open the draft pull request"
    PullRequest-->>Sdlc: $pull_request_url
  end
```

- `@aidd-dev:checker` is fresh and read-only.
- Any blocking review finding returns `iterate`.
- Dispatch only independent findings through `/aidd-dev:10-todo`, one `@aidd-dev:executor` per finding in parallel.
- Re-enter `02-deliver` to integrate, validate, commit, and run the final E2E gate.
- Only `/aidd-orchestrator:01-sdlc` calls `/aidd-vcs:02-pull-request` after verifying the reviewed SHA.
