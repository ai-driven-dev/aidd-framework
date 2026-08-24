---
name: 04-accessibility
description: Returns provider fragments for AIDD UI contracts, system deltas, or reviews. Use when the user wants to define, assess, or confirm accessibility behavior with evidence. Not for overall review priority, artifact composition, or source implementation.
argument-hint: define | assess | confirm
---

# Accessibility

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
| inspect | collect applicable accessibility evidence |
| specify | return requirement fragments |
| evaluate | return findings or confirmed rules |

## Transversal rules

- Own accessibility requirements and verdicts.
- Do not own overall review priority or artifact composition.
- Never modify application source, UI artifacts, or project memory.
