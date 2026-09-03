← [aidd-framework](../../README.md)

# aidd-dev

Code transformation plugin for the AI-Driven Development framework.

> Status: stable.

First time? Install with `/plugin install aidd-dev@aidd-framework`, then run `aidd-dev:01-plan`.

Covers code transformation: planning, implementation, assertions, audits, code review, testing, refactoring, debugging, for-sure, and parallel todo fan-out. Standalone Browser QA records short web evidence. Also hosts AI agents.

## Skills

| Bracket ID | Skill | Description |
|---|---|---|
| [2.1] | [plan](skills/01-plan/SKILL.md) | Turn a request, ticket, or file into a phased implementation plan, gathering the source first and optionally wireframing a screen before planning. |
| [2.2] | [implement](skills/02-implement/SKILL.md) | Execute an implementation plan phase by phase, recipe-style, iterating until 100% completeness. |
| [2.3] | [assert](skills/03-assert/SKILL.md) | Assert features work as intended - general assertions, architecture conformance, and frontend UI validation. |
| [2.4] | [audit](skills/04-audit/SKILL.md) | Perform deep codebase analysis to identify technical debt, dead code, and improvement opportunities. |
| [2.5] | [review](skills/05-review/SKILL.md) | Review a diff along three axes: code quality, feature behavior against the plan, and relevancy (fit to the need, declared-rule conformance, no rot). |
| [2.6] | [test](skills/06-test/SKILL.md) | Write and iterate on tests until they pass, and validate user journeys end-to-end in the browser. |
| [2.7] | [refactor](skills/07-refactor/SKILL.md) | Optimize code for performance and fix security vulnerabilities following OWASP guidelines. |
| [2.8] | [debug](skills/08-debug/SKILL.md) | Reproduce and fix bugs systematically using test-driven workflow, root cause analysis, and hypothesis validation. |
| [2.9] | [for-sure](skills/09-for-sure/SKILL.md) | Iterative agent loop that tracks attempts and retries until a success condition is met. |
| [2.10] | [todo](skills/10-todo/SKILL.md) | Split the prompt into independent todos, run one executor agent per todo in parallel, then report a minimal table. |
| [2.11] | [browser-qa](skills/11-browser-qa/SKILL.md) | Record one short named video for a locked browser happy path and each sourced browser edge case. |

## Agents

| Agent | Description |
|---|---|
| executor | Dispatched doer in its own context. Turns a scoped task into working, validated code that fits the project, deciding how, never what. Never authors a plan, never judges its own work. |
| checker | Independent critic in fresh context. Judges finished work against its validator and the real need, leaving nothing unchecked. Returns findings, scores, and a verdict. Never edits the work, never implements the fix. |
