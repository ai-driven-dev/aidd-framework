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

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-refine:01-brainstorm"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
