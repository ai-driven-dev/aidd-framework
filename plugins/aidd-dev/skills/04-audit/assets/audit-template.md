---
audit: scope-slug
chapter: number-and-name
status: complete
owner: current-context
last_verified: yyyy-mm-dd
sources:
  - resolved-source
depends_on:
  - none
---

# NN - Pillar name

## Verdict

One sentence: what matters, why, and how confident the audit is.

## Findings

Maximum five, highest impact first. Omit the example when no finding survives the evidence gate.

### PREFIX-001 - Finding title

- **Priority**: P0 | P1 | P2
- **Question**: The question that exposed the concern
- **Criterion**: The North Star, rule, invariant, risk, or expected property
- **Evidence kind**: code | configuration | test | command | artifact | runtime | history | normative
- **Evidence**: `path:line`, command result, existing artifact, or bounded observation
- **Observation**: What the evidence directly establishes
- **Interpretation**: Why the observation diverges from the criterion
- **Impact**: Material user, system, maintenance, or agent-productivity consequence
- **Likelihood**: high | medium | low
- **Reach**: local | module | system | user-base
- **Confidence**: high | medium
- **Reproduction**: Minimal reproduction or `not-applicable` with reason
- **Falsification**: Contradictory evidence checked and result
- **Next action**: Smallest action that addresses the cause
- **Effort**: S | M | L
- **Automation**: Candidate ID or `none`

## Confirmed strengths

- Important control or decision verified with its evidence. Do not add praise without consequence.

## Disputes

- Question with credible conflicting evidence, the competing interpretations, and what would settle it.

## Unknowns

- Question that could not be settled, missing evidence, and what would settle it.

## Coverage

- **Scanned**: Sources and surfaces actually examined
- **Skipped**: Excluded or inaccessible surfaces with reasons
- **Boundary**: Why further scanning was unlikely to change the top findings
