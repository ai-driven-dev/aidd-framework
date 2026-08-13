<!-- source of truth: locked-sets.json -->

# Severity Rubric

The 3 locked severity tiers below come from `references/locked-sets.json`. Assign the highest-matching tier; do not escalate speculatively.

---

## blocker

**Decision rule**: The gap will cause a downstream phase to hit a hard stop. Work cannot proceed or a deliverable cannot be verified until this gap is resolved.

**When to assign**:
- A required actor is absent and no decision can be made about their role without naming them.
- An acceptance criterion is missing and there is no other way to confirm "done" for the associated requirement.
- A dependency is unnamed and the implementation cannot start without it.
- An assumption, if wrong, invalidates a core design decision that would require starting over.

**Example 1**: A spec defines an authorization model but never names which role grants elevated access. The developer cannot implement the access check until this is resolved. Severity: `blocker`.

**Example 2**: A feature is described but has no acceptance criterion of any kind. QA has no basis for a pass/fail judgment. Severity: `blocker`.

---

## major

**Decision rule**: The gap does not prevent starting work, but it will cause rework: incomplete implementation, a failed review cycle, or a missed requirement that surfaces during testing.

**When to assign**:
- A failure mode is undescribed; it will be discovered during integration or QA and require a code change.
- An edge case is missing; it will surface in testing and require a spec amendment followed by a code fix.
- An ambiguous term is used in a critical path where two reasonable interpretations lead to different implementations.

**Example 1**: A payment spec omits the card-declined failure mode. The developer ships the happy path. QA surfaces the gap. A code fix and a re-test cycle are required. Severity: `major`.

**Example 2**: The word "user" refers to both guest and authenticated account holders in different sections, with no reconciliation. One interpretation leads to the wrong access scope. Severity: `major`.

---

## minor

**Decision rule**: The gap is cosmetic or affects documentation clarity only. Resolving it improves precision or readability but will not change an implementation decision or require rework.

**When to assign**:
- An ambiguous term exists in a non-critical context where both interpretations lead to the same implementation.
- A term lacks a formal definition but its meaning is inferable from context and consistent usage.
- A counter-example or illustrative example is absent from a requirement, leaving the intent slightly underspecified but not actionably wrong.

**Example 1**: A spec says "the button should be prominent." The design system already enforces a primary-button style. The ambiguity does not affect the implementation. Severity: `minor`.

**Example 2**: A user story omits "given / when / then" formatting but the intent is clear from the surrounding context. Severity: `minor`.

---

## Severity assignment process

1. Read the gap and identify the downstream phase most affected (design, implementation, testing, release).
2. Ask: will the gap stop that phase entirely? If yes, assign `blocker`.
3. If no: will it cause a rework cycle (code change after review or test)? If yes, assign `major`.
4. If no: assign `minor`.

Do not assign `blocker` for gaps that are discoverable and fixable within the current phase.
