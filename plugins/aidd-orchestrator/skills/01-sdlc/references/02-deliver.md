# 02 - Deliver

Produce a validated candidate from the contract.

```mermaid
---
title: Deliver the candidate
---
sequenceDiagram
  participant Sdlc as /sdlc
  participant Plan as /plan
  participant Executor as @executor
  participant Implement as /implement
  participant Assert as /assert
  participant Commit as /commit
  participant Test as /test

  Sdlc->>Plan: Build $plan from $contract
  Plan-->>Sdlc: $plan
  Sdlc->>Executor: Deliver $plan and $findings
  Executor->>Implement: Implement $plan or $fixes
  Implement-->>Executor: $candidate
  Executor->>Assert: Validate $candidate
  Assert-->>Executor: $assert_report
  opt $architecture exists
    Executor->>Assert: Validate $candidate against $architecture
    Assert-->>Executor: $architecture_report
  end
  opt $candidate has uncommitted changes
    Executor->>Commit: Commit $candidate
    Commit-->>Executor: $commit_sha
  end
  opt $journey is required
    Executor->>Test: Run final E2E for $journey
    Test-->>Executor: $journey_report
  end
  Executor-->>Sdlc: $candidate_sha
```

- `/sdlc` owns `$plan`; `@executor` never rewrites it.
- `@executor` implements and self-validates. It does not perform the independent review.
- `@executor` runs the architecture facet of `/assert` when architecture documentation applies.
- Run E2E only after implementation, assertions, and commits are complete. A failure re-enters delivery before one final E2E run.
- Return only a clean candidate with green validation to `03-check`.
