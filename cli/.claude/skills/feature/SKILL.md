---
name: feature
description: >
  Macro workflow for building or changing a vertical slice of the CLI. Use as the entry point
  when adding a new end-to-end feature (domain → use-case → adapter → command → tests) or
  when a change touches multiple layers at once. Do NOT use for single-layer changes — use the
  layer skill directly (`domain-model`, `use-case`, `adapter`, `command`, or `test`).
---

# Feature

Coordinates the five layer skills in vertical-slice order. Each step delegates entirely to the
relevant layer skill. Skip any step when the change does not touch that layer.

## Available actions

| #   | Action         | Role                                              | Input                    |
| --- | -------------- | ------------------------------------------------- | ------------------------ |
| 01  | `domain-model` | Define types, value objects, and invariants       | concept description      |
| 02  | `use-case`     | Implement business orchestration                  | domain types from 01     |
| 03  | `adapter`      | Add I/O boundary (only if a new port is needed)   | use-case port needs      |
| 04  | `command`      | Expose the feature in the CLI                     | use-case from 02         |
| 05  | `test`         | Write pyramid coverage                            | all layers from 01-04    |

## Default flow

`01 → 02 → 03 → 04 → 05`

Skip rule: if a step's layer is not affected by the change, skip it explicitly and document why (e.g. "03 skipped — no new port needed, reusing existing PluginFetcher").

## Conditional layers

These layers are triggered only when the change explicitly touches their domain. Evaluate each
before starting the main flow and apply them in parallel with whichever main steps they overlap.

| Layer        | Trigger condition                                                         | Skill        |
| ------------ | ------------------------------------------------------------------------- | ------------ |
| `tool`       | Adding or modifying an AI tool definition in `contexts/tools/domain/profiles/`           | `tool`       |
| `format`     | Adding or modifying a pure string-transform function in `domain/formats/` | `format`     |
| `capability` | Adding or modifying a capability class in `domain/capabilities/`          | `capability` |

- If the feature adds a new AI tool: run `tool` before step 01 (the tool definition underpins the domain model).
- If the feature adds a pure format transform: run `format` at the same level as step 01.
- If the feature adds a capability class: run `capability` before `tool` (the Has* interface must exist before the tool composes it).
- All three may be skipped when the change does not touch their respective domains — document the skip explicitly.

## Transversal rules

- Each action delegates fully to its layer skill. Do not inline layer-specific rules here.
- Never skip 05 — every feature change requires tests at the appropriate pyramid tier.
- Skipping 01 is allowed only when no new domain type is introduced and no existing invariant changes.
- Skipping 03 is the most common skip — only add an adapter when a genuinely new I/O boundary is required.
- Skipping 04 is allowed for internal refactors that don't expose a new CLI surface.

## External data

- `.claude/skills/domain-model/SKILL.md` — layer skill for step 01
- `.claude/skills/use-case/SKILL.md` — layer skill for step 02
- `.claude/skills/adapter/SKILL.md` — layer skill for step 03
- `.claude/skills/command/SKILL.md` — layer skill for step 04
- `.claude/skills/test/SKILL.md` — layer skill for step 05
- `.claude/skills/tool/SKILL.md` — conditional layer skill for AI tool definitions
- `.claude/skills/format/SKILL.md` — conditional layer skill for pure string transforms
- `.claude/skills/capability/SKILL.md` — conditional layer skill for capability classes
