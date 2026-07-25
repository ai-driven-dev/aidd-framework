---
name: audit-contract
description: Runtime inputs, source policy, invariants, and completion rules for question-led audits.
---

# Audit contract

## Inputs

All inputs are optional.

| Input | Default |
| --- | --- |
| Target | Current repository |
| Scope | Current application code and configuration |
| North Stars | User-supplied sources, then discovered candidates |
| Rules | Active host instructions and scoped repository rules |
| Memory | `aidd_docs/memory/**` when present |
| Architecture | Explicitly current records and observable boundaries |
| Budget | Core profile, five findings per pillar |

Record resolved inputs and unresolved conflicts in `01-scope-and-system-map.md`. A missing source skips only its dependent pillar.

## Source policy

Use, in order:

1. Current code, configuration, schemas, lockfiles, and tests as implementation truth.
2. User-confirmed North Stars as product truth.
3. Active host instructions and scoped repository rules as behavioral constraints.
4. `aidd_docs/memory/**` as maintained knowledge to verify.
5. Explicitly current architecture records as intended structure.

Exclude `.git`, vendored dependencies, build output, generated artifacts, `aidd_docs/tasks/**`, old plans, and past reviews unless explicitly placed in scope. Do not treat an observed convention as a rule.

When normative sources conflict, apply an explicit precedence supplied by the host or user. Otherwise record `disputed`; never choose silently.

## Audit states

Every concern moves through:

`question → impression → hypothesis → investigation → pass | finding | unknown | disputed`

- An impression is a search lead, never a conclusion.
- A hypothesis states what evidence would confirm or refute it.
- A finding cites decisive evidence and a material consequence.
- `unknown` means evidence is absent or inconclusive.
- `disputed` means credible evidence supports incompatible interpretations.

## 80/20 boundary

- Maximum five findings per pillar, highest impact first.
- `rules` is the exception: evaluate every active rule, while grouping repeated violations by root cause.
- Omit style preferences, harmless drift, exhaustive inventories, and low-impact completeness work.
- Stop when further scanning is unlikely to change the top actions.
- A skipped or clean pillar is still recorded in coverage.

## Read-only boundary

The audit may write only its report folder. It never edits application source, tests, configuration, memory, rules, or normative documents.

It may inspect existing test, coverage, CI, profiler, and build artifacts. It does not generate coverage, run a full suite, launch the site, or execute E2E by default.

A bounded runtime probe requires all of:

1. plausible critical correctness, security, privacy, or data-integrity impact;
2. static evidence cannot settle the hypothesis;
3. the probe is read-only and narrowly scoped;
4. `01-scope-and-system-map.md` records the reason before it runs.

## Completion

A pillar is complete when:

- its sources and exclusions are named;
- every finding passed the evidence gate;
- material unknowns remain visible;
- coverage states what was and was not examined;
- the report contains no placeholder or unsupported claim.
