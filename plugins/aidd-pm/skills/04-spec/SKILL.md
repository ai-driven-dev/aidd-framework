---
name: 04-spec
description: Generate or refine a spec, a feature's immutable contract, from a request, a PRD, or review findings. Use to draft or refine a spec. Do NOT use to write code, a full PRD, or change a locked spec.
argument-hint: build | refine
---

# Skill: spec

Generate or refine the immutable contract for a feature: its target, hard constraints, non-goals, and done-when.

## Actions

| #   | Action   | Role                                                  | Input                        |
| --- | -------- | ---------------------------------------------------- | ---------------------------- |
| 01  | `build`  | Draft a fresh spec from a request or an existing PRD | a request or a PRD path      |
| 02  | `refine` | Rewrite an existing spec to address review findings  | a spec path and the findings |

Dispatch by input: a spec path with findings runs `refine`; a request or PRD path runs `build`.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Never invent. Mark every gap as `TBD: <precise question>` rather than guessing. When a request is too vague to draft anything useful, stop and ask for a clearer one.
- The spec holds intent, never implementation. It is solution-agnostic: no file, component, hook, route, library, pattern, or token, and no "how". The done-when conditions are outcome-level, not steps. Keep the acceptance criteria few. All of that belongs to the plan.
- Keep it readable: clear section headers, bulleted criteria, explicit non-goals.
- Output: one `spec.md` in the feature folder (`aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<slug>/`), from `assets/spec-template.md`. Reuse the folder when it exists.
- Immutable once validated: never rewrite a spec that has been locked.

## Assets

- `assets/spec-template.md`: the spec's structure.
- `assets/spec-validator.yml`: the checklist a spec is validated against.
