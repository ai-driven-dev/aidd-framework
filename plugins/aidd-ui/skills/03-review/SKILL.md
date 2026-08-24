---
name: 03-review
description: Produces an evidence pinned AIDD experience review report. Use when the user wants to diagnose and prioritize interface or flow defects before acceptance or rework. Not for implementation correctness or normative contract changes.
argument-hint: interface | flow
---

# UI Review

```mermaid
flowchart LR
  interface([interface]) --> inspect
  flow([flow]) --> inspect
  inspect -->|insufficient evidence| incomplete([incomplete review])
  inspect --> specialize --> assess --> write
  write -->|findings| findings([prioritized review])
  write -->|no defect| clean([review with no findings])
```

## Actions

Read only the next action file required by the flow above.

| Action | Does |
| --- | --- |
| inspect | pin review targets and evidence |
| specialize | obtain applicable specialist verdicts |
| assess | diagnose feature experience defects |
| write | record the nonnormative review |

## Transversal rules

- Own cross-concern task diagnosis and priority.
- Specialists own accessibility and adaptation verdicts.
- Treat findings as nonnormative.
- State assessed and unassessed coverage explicitly.
