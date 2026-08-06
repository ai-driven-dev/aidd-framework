# Ship a feature end to end

Take a feature from a rough idea to a reviewed, shipped pull request with the AIDD flow.

## Why

The common loop, at a glance — the exact commands to run so you never wonder what comes next.

> Prefer a guided walkthrough? `/aidd-context:00-onboard` inspects your project and routes you step by step instead of running the sequence by hand.

## Steps to ship a feature

#### 1) 💡 Clarify

Brainstorm turns the rough idea into a precise request.

1. Run `/aidd-refine:01-brainstorm`.

```text
/aidd-refine:01-brainstorm
```

#### 2) 📋 Plan

Planning drafts the phased technical plan before implementation starts.

1. Run `/aidd-dev:01-plan`.

```text
/aidd-dev:01-plan
```

#### 3) 🔧 Implement

Implementation writes the code phase by phase.

1. Run `/aidd-dev:02-implement`.

```text
/aidd-dev:02-implement
```

#### 4) 🔍 Review

Review checks the diff before it ships.

1. Run `/aidd-dev:05-review`.

```text
/aidd-dev:05-review
```

#### 5) 📦 Commit

Commit records one atomic conventional change.

1. Run `/aidd-vcs:01-commit`.

```text
/aidd-vcs:01-commit
```

#### 6) ✅ Pull request

The pull-request step opens the PR.

1. Run `/aidd-vcs:02-pull-request`.

```text
/aidd-vcs:02-pull-request
```

> One command for the whole loop: `/aidd-orchestrator:01-sdlc` runs frame when needed → plan → implement → validate → review → challenge → ship.

## Verify

- A pull request is open on your branch, with the diff reviewed and tests passing.

Start with [Start a project](start-a-project.md) before your first feature.
