---
name: 01-design
description: Produces evidence-grounded structure, interaction, visual-system, state, and validation decisions. Use when the user wants to design or redesign an interface from product intent. Not for production frontend implementation.
argument-hint: request | requirements
---

# UI Design

```mermaid
flowchart LR
  request([request or requirements]) --> frame --> inspect --> structure --> compose --> validate --> decisions([experience decisions])
  frame -. essential unknown .-> clarify([clarification required])
  clarify --> frame
  inspect -. no interface evidence .-> no_ui([no interface boundary])
```

## Actions

Read only the next action file required by the flow above.

| Action    | Does                              |
| --------- | --------------------------------- |
| frame     | isolate the interface intent      |
| inspect   | map the existing interface system |
| structure | define the experience structure   |
| compose   | decide the interface direction    |
| validate  | verify the experience decisions   |

## Transversal rules

- Trace every meaningful decision to a requirement, task, constraint, or confirmed convention.
- Never modify application source or project memory.
- Identify a potential stable convention separately from a feature decision.
