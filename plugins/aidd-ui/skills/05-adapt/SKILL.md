---
name: 05-adapt
description: Returns context transformation fragments for AIDD UI artifacts. Use when the user wants to define, assess, or confirm behavior across space, input, or platform contexts. Not for task hierarchy, accessibility, or source implementation.
argument-hint: define | assess | confirm
---

# UI Adaptation

```mermaid
flowchart LR
  define([define]) --> inspect
  assess([assess]) --> inspect
  confirm([confirm]) --> inspect
  inspect -->|required evidence missing| unverified([unverified])
  inspect -->|define| specify --> requirements([requirement fragments])
  inspect -->|assess or confirm| evaluate
  evaluate -->|assess| findings([finding fragments])
  evaluate -->|confirm| rules([confirmed-rule fragments])
  evaluate -->|none supported| none([no supported fragment])
```

## Actions

Read only the next action file required by the flow above.

| Action | Does |
| --- | --- |
| inspect | collect adaptation evidence |
| specify | return requirement fragments |
| evaluate | return findings or confirmed rules |

## Transversal rules

- Own transformations across context.
- Feature design owns invariant task hierarchy.
- Exclude keyboard operability, focus, minimum target size, and accessibility zoom.
- Accessibility owns excluded concerns.
- Never modify application source, UI artifacts, or project memory.
