---
name: 01-brainstorm
description: Clarify a vague product or technical intent through natural discovery. Use when the user has a half-formed idea, ambiguous request, or asks to brainstorm, discover, refine, or clarify. Not for artifact gap scans, planning, or code.
argument-hint: idea
---
# Brainstorm

```mermaid
flowchart LR
  capture --> probe --> integrate
  integrate -->|"open fork"| probe
  integrate -->|"clear enough"| finalize
  finalize -->|"user wants more"| probe
```

## Actions

Run the flow above. Read only the next action's file before running it.

| Action | Does |
| ------ | ---- |
| capture | restate the idea and pick what matters next |
| probe | ask the next useful questions |
| integrate | fold answers and decide whether to continue |
| finalize | produce the approved refined idea |

## Transversal rules

- Clarify intent, never plan, build, or code.
- Ask only questions that can change what gets built.
- Flag assumptions as assumptions.
- State a leaning and its tradeoff when facts already point one way.
- Hide process words: no density, coverage, nodes, completeness, matrix, or frame unless the user asks for an audit.
- Wait after questions, approval, and persistence choices.
