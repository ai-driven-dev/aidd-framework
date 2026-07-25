# 03 - Check

Review the candidate in a fresh context and route the verdict.

```mermaid
---
title: Check independently
---
sequenceDiagram
  participant Sdlc as /sdlc
  participant Checker as @checker
  participant Review as /review
  participant Todo as /todo
  participant ExecutorA as @executor A
  participant ExecutorN as @executor N
  participant PullRequest as /pull-request

  Sdlc->>Checker: Review $contract, $plan, and $candidate_sha
  Checker->>Review: Review $candidate_diff
  Review-->>Checker: $review and $verdict
  Checker-->>Sdlc: $verdict
  alt Iterate
    Sdlc->>Todo: Dispatch $findings
    par Finding A
      Todo->>ExecutorA: Implement $finding_a
    and Finding N
      Todo->>ExecutorN: Implement $finding_n
    end
    ExecutorA-->>Todo: $fix_a
    ExecutorN-->>Todo: $fix_n
    Todo-->>Sdlc: $fixes
    Sdlc->>Sdlc: Route $fixes to 02 deliver
  else Ship
    Sdlc->>Sdlc: Verify $reviewed_sha is current
    Sdlc->>PullRequest: Open draft for $reviewed_sha
    PullRequest-->>Sdlc: $pull_request_url
  end
```

- `@checker` is fresh and read-only.
- Any blocking review finding returns `iterate`.
- Dispatch only independent findings through `/todo`, one `@executor` per finding in parallel.
- Re-enter `02-deliver` to integrate, validate, commit, and run the final E2E gate.
- Only `/sdlc` calls `/pull-request` after verifying the reviewed SHA.
