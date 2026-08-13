<!-- source of truth: locked-sets.json -->

# Categories

The 7 locked categories below come from `references/locked-sets.json`. No other category values are valid.

---

## unstated assumption

**Definition**: The author treats a condition as obvious or pre-agreed without writing it down. Another reader or implementer would not know the assumption exists.

**Positive example**: A PRD describes the checkout flow but never states that users must be authenticated before entering it. Every team member silently assumes this, but the requirement is absent from the document.

**Counter-example**: "The PRD should clarify the checkout flow." This is vague feedback, not a named assumption. Use this category only when a specific implicit condition can be stated.

---

## ambiguous term

**Definition**: A word or phrase has more than one reasonable interpretation within the document's context, and the intended meaning is not pinned down by a definition or example.

**Positive example**: A spec says the system must respond "quickly." Without a numeric threshold or reference benchmark, "quickly" means different things to different implementers.

**Counter-example**: "Users receive a confirmation email." The word "users" is broad, but when the document consistently uses it to mean authenticated account holders, no genuine ambiguity exists; this gap does not qualify.

---

## missing edge case

**Definition**: A boundary condition or exceptional input that the described behavior does not cover. The main path is specified, but behavior at the edges is silent.

**Positive example**: A file-upload spec defines the happy path for valid files under 10 MB but says nothing about files that are exactly 10 MB or about zero-byte files.

**Counter-example**: "What happens if the network is slow?" Network slowness is a failure mode (latency or timeout), not an input edge case. Classify it under `missing failure mode` instead.

---

## missing actor

**Definition**: An entity (person, system, or role) that takes an action or is affected by the system is absent from the document. The process cannot be fully traced without naming it.

**Positive example**: A user-story describes the approval workflow: a request is submitted, reviewed, and approved. The document names the requester but never names the reviewer role or what system sends the approval notification.

**Counter-example**: "The admin panel is mentioned but not described in detail." The actor (admin) is present; what is missing is behavioral detail. That is a `missing acceptance criterion` gap, not a missing actor.

---

## missing failure mode

**Definition**: The document specifies what happens on the success path but omits one or more ways the operation can fail, including how the system should respond.

**Positive example**: A payment integration spec defines the successful charge flow but does not address what happens when the payment provider returns a timeout, a card-declined code, or a duplicate-charge error.

**Counter-example**: "The spec does not mention two-factor authentication." Absence of 2FA is an unstated security assumption or a missing feature, not a failure mode. Classify accordingly.

---

## missing acceptance criterion

**Definition**: A functional requirement or behavior described in prose has no testable pass/fail condition. Without it, "done" cannot be verified objectively.

**Positive example**: A feature description says "the search must return relevant results." No criterion specifies the minimum relevance score, the maximum response time, or the expected result set for a given query.

**Counter-example**: "The login screen is not covered." Absence of a feature section is a `missing edge case` or `missing actor` gap depending on what is absent; it is not a missing acceptance criterion unless a feature is described but lacks a pass/fail test.

---

## missing dependency

**Definition**: The described behavior relies on an external system, service, library, data set, or prior workflow step that is not named or whose readiness is not addressed.

**Positive example**: A spec describes sending SMS notifications but never names the SMS provider, the API contract, or how credentials are managed. An implementer cannot start without resolving these.

**Counter-example**: "The spec assumes the database schema is ready." If the schema dependency is explicitly listed in a prerequisite section, even briefly, the dependency is stated; this gap does not apply.
