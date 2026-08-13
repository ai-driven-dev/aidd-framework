<!-- source of truth: locked-sets.json -->

# Probe Style

Rules for writing direct-question probes. The locked question forms come from `references/locked-sets.json` (`probe.question_forms`).

---

## Rules

1. Each probe begins with a question form from the locked list: `what`, `when`, `who`, `which`, `how`, `why`, `where`, `does`, `can`, `will`, `should`, `is`, `are`, `do`.
2. Each probe ends with `?`.
3. Each probe targets one specific gap. Do not combine two questions into a single probe.
4. The probe names the specific subject (role, field, condition, term), not the artifact or a generic concept.
5. Prefer the shortest question form that makes the gap actionable. Avoid preamble.

---

## Positive examples

These probes satisfy all 5 rules. The question form used is noted for clarity.

- `who`: Who is responsible for approving the access request before it is acted on?
- `what`: What should the system return to the caller when the payment provider responds with a timeout?
- `which`: Which user roles are permitted to delete a published record?
- `how`: How is the session invalidated when the user's account is suspended mid-session?
- `does`: Does the 10 MB file-size limit apply to each individual file in a multi-file upload or to the combined total?

---

## Counter-examples (forms to avoid)

These examples violate one or more rules. Do not write probes in these forms.

- "The spec is unclear about authentication." Statement, no question form, does not end with `?`. Describes the problem abstractly instead of asking for the specific missing information.
- "Authentication and authorization both need clarification, and the roles section is incomplete." Combines multiple targets in one sentence. Breaks rule 3 (one specific gap per probe).
- "Could you clarify the access control model?" Vague subject. Does not identify which part of the access control model is missing or ambiguous. Breaks rule 4.
