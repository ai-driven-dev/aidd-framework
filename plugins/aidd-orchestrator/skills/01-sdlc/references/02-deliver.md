# 02 - Deliver

Produce a validated candidate from the contract.

```mermaid
---
title: Deliver the candidate
---
sequenceDiagram
  participant Sdlc as /aidd-orchestrator:01-sdlc
  participant Plan as /aidd-dev:01-plan
  participant Executor as @aidd-dev:executor
  participant Implement as /aidd-dev:02-implement
  participant Assert as /aidd-dev:03-assert
  participant Commit as /aidd-vcs:01-commit
  participant Test as /aidd-dev:06-test

  Sdlc->>Plan: "Build the implementation plan"
  Plan-->>Sdlc: $plan
  Sdlc->>Executor: "Deliver the plan or review findings"
  Executor->>Implement: "Implement the plan or fixes"
  Implement-->>Executor: $candidate
  Executor->>Assert: "Validate the candidate"
  Assert-->>Executor: $assert_report
  opt "Architecture documentation exists"
    Executor->>Assert: "Run assert-architecture"
    Assert-->>Executor: $architecture_report
  end
  opt "The candidate has uncommitted changes"
    Executor->>Commit: "Commit the candidate"
    Commit-->>Executor: $commit_sha
  end
  opt "A user journey is required"
    Executor->>Test: "Run the final E2E journey"
    Test-->>Executor: $journey_report
  end
  Executor-->>Sdlc: $candidate_sha
```

- `/aidd-orchestrator:01-sdlc` owns `$plan`; `@aidd-dev:executor` never rewrites it.
- `@aidd-dev:executor` implements and self-validates. It does not perform the independent review.
- `@aidd-dev:executor` runs `assert-architecture` through `/aidd-dev:03-assert` when architecture documentation applies.
- Run E2E only after implementation, assertions, and commits are complete. A failure re-enters delivery before one final E2E run.
- Return only a clean candidate with green validation to `03-check`.
