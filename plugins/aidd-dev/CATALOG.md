# aidd-dev catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-dev` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`agents`](#agents)
- [`skills`](#skills)
  - [`skills/01-plan`](#skills01-plan)
  - [`skills/02-implement`](#skills02-implement)
  - [`skills/03-assert`](#skills03-assert)
  - [`skills/04-audit`](#skills04-audit)
  - [`skills/05-review`](#skills05-review)
  - [`skills/06-test`](#skills06-test)
  - [`skills/07-refactor`](#skills07-refactor)
  - [`skills/08-debug`](#skills08-debug)
  - [`skills/09-for-sure`](#skills09-for-sure)
  - [`skills/10-todo`](#skills10-todo)
  - [`skills/11-browser-qa`](#skills11-browser-qa)

---

### `.claude-plugin`

| File |
|------|
| [plugin.json](.claude-plugin/plugin.json) |

### `agents`

| File | Description |
|------|---|
| [checker.md](agents/checker.md) | `Judges finished work against its validator and the real need, leaving nothing unchecked. Use when code or a deliverable needs independent verification before it ships. Never edits the work, never implements the fix.` |
| [executor.md](agents/executor.md) | `Turns a dispatched task into working, validated code that fits the project. Use when an approved scope must become code. Never plans, never judges its own work.` |

### `skills`

#### `skills/01-plan`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-gather.md](skills/01-plan/actions/01-gather.md) | - |
| `actions` | [02-explore.md](skills/01-plan/actions/02-explore.md) | - |
| `actions` | [03-wireframe.md](skills/01-plan/actions/03-wireframe.md) | - |
| `actions` | [04-plan.md](skills/01-plan/actions/04-plan.md) | - |
| `assets` | [phase-template.md](skills/01-plan/assets/phase-template.md) | - |
| `assets` | [plan-template.md](skills/01-plan/assets/plan-template.md) | - |
| `references` | [plan-status.md](skills/01-plan/references/plan-status.md) | `Plan lifecycle status field - values, meaning, who writes each, and when.` |
| `references` | [wireframe-conventions.md](skills/01-plan/references/wireframe-conventions.md) | - |
| `-` | [SKILL.md](skills/01-plan/SKILL.md) | `Turn a request, ticket, or file into a phased implementation plan. Use to plan a feature before building, or to turn a ticket into phases. Do NOT use to write code or review a diff.` |

#### `skills/02-implement`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-prepare.md](skills/02-implement/actions/01-prepare.md) | - |
| `actions` | [02-execute.md](skills/02-implement/actions/02-execute.md) | - |
| `actions` | [03-finalize.md](skills/02-implement/actions/03-finalize.md) | - |
| `references` | [blocked.md](skills/02-implement/references/blocked.md) | `Conditions that make a plan blocked (needs a human).` |
| `-` | [SKILL.md](skills/02-implement/SKILL.md) | `Write an existing plan's code, phase by phase, until every acceptance criterion holds. Use when a plan exists and needs implementing. Do NOT use to write a plan, review a diff.` |

#### `skills/03-assert`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-assert.md](skills/03-assert/actions/01-assert.md) | - |
| `actions` | [02-assert-architecture.md](skills/03-assert/actions/02-assert-architecture.md) | - |
| `actions` | [03-assert-frontend.md](skills/03-assert/actions/03-assert-frontend.md) | - |
| `assets` | [task-template.md](skills/03-assert/assets/task-template.md) | - |
| `-` | [SKILL.md](skills/03-assert/SKILL.md) | `Assert the work behaves by iterating the project's coding assertions until they pass, plus optional architecture and frontend facets. Use to validate an implementation. Not for reviewing or writing tests.` |

#### `skills/04-audit`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-code-quality.md](skills/04-audit/actions/01-code-quality.md) | - |
| `actions` | [02-architecture.md](skills/04-audit/actions/02-architecture.md) | - |
| `actions` | [03-security.md](skills/04-audit/actions/03-security.md) | - |
| `actions` | [04-dependencies.md](skills/04-audit/actions/04-dependencies.md) | - |
| `actions` | [05-performance.md](skills/04-audit/actions/05-performance.md) | - |
| `actions` | [06-tests.md](skills/04-audit/actions/06-tests.md) | - |
| `actions` | [07-ui.md](skills/04-audit/actions/07-ui.md) | - |
| `assets` | [audit-template.md](skills/04-audit/assets/audit-template.md) | `Codebase audit report template` |
| `-` | [SKILL.md](skills/04-audit/SKILL.md) | `Audit a codebase read-only across seven quality pillars into one ranked report. Use when the user wants to assess, health-check, or audit a codebase or one pillar. Not for fixing findings, reviewing a change, or checking a feature works.` |

#### `skills/05-review`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-review-code.md](skills/05-review/actions/01-review-code.md) | - |
| `actions` | [02-review-functional.md](skills/05-review/actions/02-review-functional.md) | - |
| `actions` | [03-review-relevancy.md](skills/05-review/actions/03-review-relevancy.md) | - |
| `assets` | [review-template.md](skills/05-review/assets/review-template.md) | - |
| `references` | [review-rubric.md](skills/05-review/references/review-rubric.md) | - |
| `-` | [SKILL.md](skills/05-review/SKILL.md) | `Review a diff read-only on three axes, code, behavior versus the plan, and relevancy, into one verdict report. Use before shipping a change. Not for fixing findings or auditing a codebase.` |

#### `skills/06-test`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-test.md](skills/06-test/actions/01-test.md) | - |
| `actions` | [02-test-journey.md](skills/06-test/actions/02-test-journey.md) | - |
| `-` | [SKILL.md](skills/06-test/SKILL.md) | `Write and iterate tests until they pass, or validate a user journey end to end in the browser. Use when the user wants to add coverage, find what's untested, or walk a flow. Not for auditing test health or debugging a failure.` |

#### `skills/07-refactor`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-performance.md](skills/07-refactor/actions/01-performance.md) | - |
| `actions` | [02-security.md](skills/07-refactor/actions/02-security.md) | - |
| `actions` | [03-cleanup.md](skills/07-refactor/actions/03-cleanup.md) | - |
| `actions` | [04-architecture.md](skills/07-refactor/actions/04-architecture.md) | - |
| `-` | [SKILL.md](skills/07-refactor/SKILL.md) | `Improve code across four axes (cleanup, performance, security, architecture) by scanning and fixing, or applying a pushed audit report. Use when the user wants to refactor, optimize, harden, or remove code. Not for read-only diagnosis or adding tests.` |

#### `skills/08-debug`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-reproduce.md](skills/08-debug/actions/01-reproduce.md) | - |
| `actions` | [02-debug.md](skills/08-debug/actions/02-debug.md) | - |
| `actions` | [03-reflect-issue.md](skills/08-debug/actions/03-reflect-issue.md) | - |
| `assets` | [task-template.md](skills/08-debug/assets/task-template.md) | `Task tracking system to ensure all tasks are categorized and addressed` |
| `references` | [mermaid-conventions.md](skills/08-debug/references/mermaid-conventions.md) | `Rules for generating valid, high-quality Mermaid diagrams. Apply when creating or reviewing any Mermaid diagram (flowchart, state, ER, sequence, gantt).` |
| `-` | [SKILL.md](skills/08-debug/SKILL.md) | `Reproduce and fix a known bug, or find an unknown root cause by hypothesis validation. Use when the user wants to fix a bug, find why something breaks, or reopen a stuck investigation. Not for building a feature or reviewing a diff.` |

#### `skills/09-for-sure`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-init-tracking.md](skills/09-for-sure/actions/01-init-tracking.md) | - |
| `actions` | [02-auto-accept.md](skills/09-for-sure/actions/02-auto-accept.md) | - |
| `actions` | [03-autonomous-loop.md](skills/09-for-sure/actions/03-autonomous-loop.md) | - |
| `assets` | [autonomous-loop-worker-prompt.md](skills/09-for-sure/assets/autonomous-loop-worker-prompt.md) | - |
| `assets` | [plan-template.md](skills/09-for-sure/assets/plan-template.md) | - |
| `references` | [autonomous-loop-log-format.md](skills/09-for-sure/references/autonomous-loop-log-format.md) | - |
| `-` | [SKILL.md](skills/09-for-sure/SKILL.md) | `Run an iterative agent loop that retries until a runnable success condition passes. Use when the user says "for sure", "keep trying until", or wants guaranteed completion against a success command. Not for one-shot tasks or uncheckable goals.` |

#### `skills/10-todo`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-todo.md](skills/10-todo/actions/01-todo.md) | - |
| `-` | [SKILL.md](skills/10-todo/SKILL.md) | `Split the user prompt into independent todos and run one executor agent per todo in parallel, then report a minimal table. Use when the user says "todo" or asks to fan out a multi-part request into parallel implementations.` |

#### `skills/11-browser-qa`

| Group | File | Description |
|-------|------|---|
| `actions` | [00-prerequisites.md](skills/11-browser-qa/actions/00-prerequisites.md) | - |
| `actions` | [01-load-scope.md](skills/11-browser-qa/actions/01-load-scope.md) | - |
| `actions` | [02-prepare-run.md](skills/11-browser-qa/actions/02-prepare-run.md) | - |
| `actions` | [03-run-scenarios.md](skills/11-browser-qa/actions/03-run-scenarios.md) | - |
| `assets` | [qa-report-template.md](skills/11-browser-qa/assets/qa-report-template.md) | - |
| `references` | [run-scope-playwright-cli.md](skills/11-browser-qa/references/run-scope-playwright-cli.md) | - |
| `-` | [SKILL.md](skills/11-browser-qa/SKILL.md) | `Run post-review browser QA and produce short named videos for a locked happy path and sourced browser edge cases. Use when the user wants concise reviewer evidence for a web journey. Not for API, CLI, automated tests, diff review, or application fixes.` |

