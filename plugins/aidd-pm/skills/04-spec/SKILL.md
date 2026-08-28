---
name: 04-spec
description: Generate or refine a spec, a feature's immutable contract, from a request, a PRD, or review findings. Use when the user wants to draft or refine a spec. Not for writing code, a full PRD, or changing a locked spec.
argument-hint: request | prd | spec
---

# Spec

```mermaid
flowchart LR
  request([request or PRD path]) --> build --> done([spec.md])
  target([spec path + findings]) --> refine --> done
```

## Actions

Run the flow above. Read only the next action file.

| Action | Does                                             |
| ------ | -------------------------------------------------- |
| build  | draft a fresh spec from a request or PRD          |
| refine | rewrite an existing spec to address findings      |

## Transversal rules

- Never invent; mark every gap instead of guessing.
- Never explore the codebase.
- Hold intent, never implementation: solution-agnostic, no how, few acceptance criteria.
- Keep it readable: clear headers, bulleted criteria, explicit non-goals.
- Immutable once validated: never rewrite a locked spec.
