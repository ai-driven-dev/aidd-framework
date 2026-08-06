# Start a project (greenfield)

Take a greenfield idea to a set-up project with its AIDD context, ready for the first feature.

## Why

The greenfield sequence, at a glance — from a raw idea to a project the AIDD flow can build on.

> Prefer a guided walkthrough? `/aidd-context:00-onboard` inspects your project and routes you step by step instead of running the sequence by hand.

## Steps to start a project

#### 1) 💡 Brainstorm the idea

Brainstorming sharpens the raw idea into a precise request.

1. Run `/aidd-refine:01-brainstorm`.

```text
/aidd-refine:01-brainstorm
```

#### 2) 📄 Discover the product and draft the PRD

The PRD turns the idea into structured product requirements.

1. Run `/aidd-pm:06-product-brief`.
2. Pass its brief to `/aidd-pm:03-prd`.

```text
/aidd-pm:06-product-brief
/aidd-pm:03-prd
```

#### 3) 🏗️ Design the architecture

Bootstrap validates a stack through Q&A and outputs an `INSTALL.md`.

1. Run `/aidd-context:01-bootstrap`.

```text
/aidd-context:01-bootstrap
```

#### 4) 🧠 Build project memory

Project memory creates the memory bank and AI context files.

1. Run `/aidd-context:02-project-memory`.

```text
/aidd-context:02-project-memory
```

#### 5) 🚀 Ship the first feature

The feature recipe takes the project through the per-feature loop.

1. Follow [Ship a feature](ship-a-feature.md).

```text
/aidd-orchestrator:01-sdlc
```

## Verify

- `aidd_docs/memory/` holds the memory files, and an `INSTALL.md` describes the chosen stack.

Use `/aidd-context:00-onboard` any time to see where the project sits.
