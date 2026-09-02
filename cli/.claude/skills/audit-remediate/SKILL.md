---
name: audit-remediate
description: >
  Macro workflow for auditing one context (or one of the non-context areas: kernel,
  presentation, runtime) against its authoritative skill or rules, applying fixes, and gating
  the result. Use when you need to prove a context skill on real code, clean up an existing
  context after a skill or rule update, or verify that a context is already compliant. Always
  captures a golden baseline before touching any file and rolls back automatically if any gate
  fails. Do NOT use for adding new features — use `feature` instead. Do NOT use for changes
  that touch multiple contexts at once — run this macro once per context.
---

# Audit-Remediate

Executes the audit → apply-context-skill → gate → rollback loop for a single target area.
Each step delegates entirely to the relevant action or context skill. The macro never inlines
context-specific rules — it routes to the authoritative context skill (or, for `kernel`,
`presentation`, and `runtime`, to the relevant `.claude/rules/00-architecture/*.md`) for all
judgements about what is correct or incorrect.

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

## Skill routing

Apply the correct authority in action 03 based on the target directory:

| Target directory | Authoritative skill or rule |
| ------------------------ | ------------------------- |
| `src/contexts/tools/`       | `tools` skill |
| `src/contexts/translate/`   | `translate` skill |
| `src/contexts/distribution/` | `distribution` skill |
| `src/contexts/framework/`   | `framework` skill |
| `src/kernel/`               | `.claude/rules/00-architecture/0-contexts.md` — kernel imports no context, carries no business logic |
| `src/presentation/`         | `.claude/rules/00-architecture/0-deps-wiring.md` |
| `src/runtime/`               | no dedicated skill — follow the port/adapter shape the target context skill describes for the port it implements |

If the target directory does not map to a known context skill or rule, stop and report the
ambiguity before proceeding to action 02.

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

- `.claude/skills/tools/SKILL.md` — authoritative skill for `src/contexts/tools/`
- `.claude/skills/translate/SKILL.md` — authoritative skill for `src/contexts/translate/`
- `.claude/skills/distribution/SKILL.md` — authoritative skill for `src/contexts/distribution/`
- `.claude/skills/framework/SKILL.md` — authoritative skill for `src/contexts/framework/`
- `.claude/rules/00-architecture/` — authoritative rules for `src/kernel/`, `src/presentation/`, `src/runtime/`
- `references/rollback-protocol.md` — rollback commands and safe-restore procedures
- `references/gate-criteria.md` — what constitutes a passing gate
