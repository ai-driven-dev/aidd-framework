---
name: audit-remediate
description: >
  Macro workflow for auditing a single domain layer against its authoritative layer skill,
  applying fixes, and gating the result. Use when you need to prove a layer skill on real
  code, clean up an existing layer after a skill update, or verify that a layer is already
  compliant. Always captures a golden baseline before touching any file and rolls back
  automatically if any gate fails. Do NOT use for adding new features — use `feature`
  instead. Do NOT use for changes that touch multiple layers at once — run this macro once
  per layer.
---

# Audit-Remediate

Executes the audit → apply-layer-skill → gate → rollback loop for a single target layer.
Each step delegates entirely to the relevant action or layer skill. The macro never inlines
layer-specific rules — it routes to the authoritative layer skill for all judgements about
what is correct or incorrect.

## Available actions

| #   | Action                        | Role                                                                   | Input                                              |
| --- | ----------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| 01  | `capture-golden-baseline`     | Record the current passing state as the immutable reference point      | target layer path + layer skill name               |
| 02  | `audit-layer`                 | Enumerate all violations in the target layer per the layer skill       | layer skill + target layer files                   |
| 03  | `apply-layer-skill`           | Apply the layer skill to fix each violation; log fix-or-clean per file | violation list from 02 + layer skill               |
| 04  | `gate-golden-and-tests`       | Verify golden baseline is byte-identical and all tests pass            | baseline from 01 + test suite                      |
| 05  | `verify-or-rollback`          | Commit if gate passes; roll back to baseline if gate fails             | gate result from 04                                |

## Default flow

`01 → 02 → 03 → 04 → 05`

Skip 03 when 02 finds zero violations (clean verdict) — document the skip explicitly:
"03 skipped — layer audited clean by \<layer-skill\>".

## Layer skill routing

Apply the correct layer skill in action 03 based on the target directory:

| Target directory         | Authoritative layer skill |
| ------------------------ | ------------------------- |
| `domain/formats/`        | `format`                  |
| `domain/capabilities/`   | `capability`              |
| `contexts/tools/domain/profiles/`       | `tool`                    |
| `domain/models/`         | `domain-model`            |
| `application/use-cases/` | `use-case`                |
| `infrastructure/adapters/` | `adapter`               |
| `application/commands/`  | `command`                 |

If the target directory does not map to a known layer skill, stop and report the ambiguity
before proceeding to action 02.

## Rollback protocol

- If action 04 fails (gate red): invoke `git restore <target-layer-path>` to discard all
  uncommitted changes in the target layer, then append a failure entry to the task log.
- Never commit a red state. Never rename the tracking file to `.done.md` unless gate passes.
- A failed run is retried only with a meaningfully different approach; log the change.

## Transversal rules

- Each action delegates fully to its layer skill or sub-process. Do not inline layer rules here.
- The baseline captured in 01 is immutable — it is the ground truth for gate comparisons.
- Action 02 produces a named violation list; action 03 works through that list one item at a time.
- After action 03, the layer must have zero uncommitted behavior changes that cannot be traced
  to a fix in the violation list.
- Log every fix AND every confirmed-clean verdict in the task tracking file — that log is the
  proof the layer skill was exercised.
- Never skip 04 — the gate is mandatory even when 02 found no violations (clean run still
  re-runs tests to confirm nothing drifted).

## External data

- `.claude/skills/format/SKILL.md` — layer skill for `domain/formats/`
- `.claude/skills/capability/SKILL.md` — layer skill for `domain/capabilities/`
- `.claude/skills/tool/SKILL.md` — layer skill for `contexts/tools/domain/profiles/`
- `.claude/skills/domain-model/SKILL.md` — layer skill for `domain/models/`
- `.claude/skills/use-case/SKILL.md` — layer skill for `application/use-cases/`
- `.claude/skills/adapter/SKILL.md` — layer skill for `infrastructure/adapters/`
- `.claude/skills/command/SKILL.md` — layer skill for `application/commands/`
- `references/rollback-protocol.md` — rollback commands and safe-restore procedures
- `references/gate-criteria.md` — what constitutes a passing gate
