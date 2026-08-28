← [aidd-framework](../../README.md)

# aidd-refine

Meta-cognition plugin for the AI-Driven Development framework.

> Status: stable.

First time? Install with `/plugin install aidd-refine@aidd-framework`, then run `aidd-refine:01-brainstorm`.

Four skills that refine inputs and outputs through reflection: clarify vague requests, challenge prior work for correctness, analytically scan artifacts for blind spots, and verify factual claims against authoritative sources.

## Skills

| Bracket ID | Skill      | Description                                                                                                                                                                                   |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [5.1]      | [brainstorm](skills/01-brainstorm/SKILL.md) | Clarify a vague product or technical intent through natural discovery, converging until the idea is precise enough to act on.                            |
| [5.2]      | [challenge](skills/02-challenge/SKILL.md)  | Rethink prior work to verify correctness against an agreed plan, classifying findings with a confidence score.                                                                                |
| [5.3]      | [shadow-areas](skills/03-shadow-areas/SKILL.md) | Analytical scan of a written artifact for blind spots: each gap is classified by category and severity, paired with a direct-question probe.                                              |
| [5.4]      | [fact-check](skills/04-fact-check/SKILL.md) | Verify factual claims against authoritative sources and rewrite the text with footnote citations, hedging anything that cannot be confirmed.                                              |
