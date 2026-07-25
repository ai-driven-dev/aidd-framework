---
name: question-protocol
description: Converts introspective audit questions into falsifiable, evidence-gated conclusions.
---

# Question protocol

## Loop

For each high-leverage question:

1. **Ask.** Use the pillar's question pack.
2. **Impression.** State the uncomfortable first read in one sentence.
3. **Hypothesis.** Name the suspected problem, expected consequence, confirming evidence, and refuting evidence.
4. **Investigate.** Inspect the cheapest decisive evidence first.
5. **Challenge.** Search once for contradictory evidence or a simpler explanation.
6. **Verdict.** Record `pass`, `finding`, `unknown`, or `disputed`.

Do not expose hidden chain-of-thought. Reports contain only questions, concise hypotheses, evidence, and verdicts.

## Choice questions

- Which choices were specified by a North Star, rule, or accepted architecture source?
- Which choices appear to have been made because the work was underspecified?
- Which choices are low-confidence, irreversible, or unusually broad?
- Which local constant, threshold, buffer, special case, or abstraction solves only the observed example?
- What would a careful engineer choose differently today, and why?
- Which decision is being inferred retrospectively rather than established by history?

Decision provenance:

- `specified`: directly required by a normative source;
- `agent-made`: explicitly recorded by the implementation context;
- `retrospectively-inferred`: reconstructed from code or history.

Retrospective inference never proves original intent.

## Pride and blindness questions

- Would you defend this design during an incident?
- What feels clever rather than clear?
- What are you least confident about?
- What important fact is unavailable from this repository?
- Where could the system fail while looking successful?
- Which two parts of the system tell incompatible stories?

Treat answers as impressions until verified.

## Evidence gate

A finding needs:

- a named criterion or risk;
- a concrete evidence kind and reference;
- a direct observation separated from its interpretation;
- material impact with likelihood and reach;
- a confidence level;
- a minimal reproduction, or a reason why reproduction does not apply;
- one attempt to falsify it.

Confidence:

- `high`: direct evidence with no credible contradiction;
- `medium`: converging evidence with a remaining assumption;
- `low`: useful concern, but insufficient for a finding; report as `unknown`.

## Generality gate

A fix or decision is non-general when it makes the observed example pass while the underlying class can still fail. Check:

- nearby inputs, sizes, platforms, or call sites;
- duplicated local exceptions;
- unexplained constants or thresholds;
- invariant enforcement at the correct boundary;
- whether another caller can reproduce the same class.

## Automation question

For every recurring issue ask: “What should make this class impossible or automatically visible next time?”

Choose the strongest proportionate layer:

- type, schema, lint, static analysis;
- unit, property, integration, or E2E test;
- CI check or repository automation;
- rule, skill, memory, code comment, or canonical documentation;
- runtime assertion, telemetry, or alert.

Do not automate a one-off preference or create machinery whose maintenance cost exceeds the protected risk.
