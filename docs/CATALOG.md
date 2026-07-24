# Skill Catalog

The exhaustive list of AIDD plugins, skills, and actions. Skills are invoked through your AI tool by their `plugin:NN-slug` name (slash command, MCP, or natural-language trigger). Actions are the internal steps a skill runs; you do not call them directly.

- [aidd-context](#-aidd-context) - knowledge production
- [aidd-dev](#-aidd-dev) - code transformation
- [aidd-pm](#-aidd-pm) - product management
- [aidd-refine](#-aidd-refine) - meta-cognition
- [aidd-vcs](#-aidd-vcs) - version control workflows
- [aidd-orchestrator](#-aidd-orchestrator) - async orchestration (optional)
- [aidd-ui](#-aidd-ui) - UI / UX (🚧 alpha, not ready)

---

## 🧭 aidd-context

Bootstrap, project init, context-artifact generation, diagrams, learning, and exploration.

| Skill                  | Role                                                                          | Actions                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `00-onboard`           | Guide the project's journey through AIDD, from first setup to shipping a feature | `01-scan`, `02-assess`, `03-present`, `04-run`                                                            |
| `01-bootstrap`         | Imagine and validate a new SaaS architecture, output an `INSTALL.md`          | `01-gather-needs`, `02-propose-candidates`, `03-audit-candidates`, `04-pick-and-design`, `05-write-install-md` |
| `02-project-memory`    | Give the AI a memory of the project, wired into the tools you use              | `01-scan`, `02-generate`, `03-sync`                                                                      |
| `03-context-generate`  | Router that dispatches an artifact-generation request to the dedicated generator below | delegates to `04`–`08` (and plugins / marketplaces)                                            |
| `04-skill-generate`    | Generate a router-based skill across the host AI tool(s)                       | `01-scope`, `02-plan`, `03-write`, `04-validate`                                                         |
| `05-rule-generate`     | Generate a coding rule that governs editor and agent behavior                 | `01-capture-rule`, `02-write-rule`, `03-validate`                                                        |
| `06-agent-generate`    | Generate an agent across the host AI tool(s)                                   | `01-capture-agent`, `02-write-agent`, `03-validate`                                                      |
| `07-command-generate`  | Generate a flat slash command across the host AI tool(s)                       | `01-capture-command`, `02-write-command`, `03-validate`                                                  |
| `08-hook-generate`     | Generate a lifecycle hook across the host AI tool(s)                           | `01-capture-hook`, `02-write-hook`, `03-validate`                                                        |
| `09-mermaid`           | Generate Mermaid diagrams via a plan-validate workflow                        | `01-mermaid`                                                                                             |
| `10-learn`             | Capture learnings, conventions, and decisions into memory, decisions, rules   | `01-gather`, `02-assess`, `03-write`, `04-sync`                                                          |
| `11-explore`           | Survey the project across tooling, context, and codebase, then drill into one axis | `01-survey`, `02-drill`                                                                                  |
| `12-cook`              | Manage project and bundled recipes: list, create/update, research, or apply one | `01-list`, `02-upsert`, `03-research`, `04-apply`                                                        |

## 💻 aidd-dev

The development SDLC: plan, implement, assert, audit, review, test, refactor, debug, for-sure, todo.

| Skill           | Role                                                                       | Actions                                                                         |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `00-sdlc`       | Pure orchestrator driving the full dev flow end to end                     | `01-spec`, `02-plan`, `03-implement`, `04-review`, `05-ship`                     |
| `01-plan`       | Turn a request, ticket, or file into a phased implementation plan: gather, explore, wireframe, plan | `01-gather`, `02-explore`, `03-wireframe`, `04-plan`          |
| `02-implement`  | Execute a plan phase by phase until 100% complete                          | `01-implement`                                                                   |
| `03-assert`     | Assert features work - general, architecture, frontend UI                  | `01-assert`, `02-assert-architecture`, `03-assert-frontend`                      |
| `04-audit`      | Read-only codebase audit across quality pillars                            | `01-code-quality`, `02-architecture`, `03-security`, `04-dependencies`, `05-performance`, `06-tests`, `07-ui` |
| `05-review`     | Read-only review of a diff - code quality and feature behavior             | `01-review-code`, `02-review-functional`                                         |
| `06-test`       | Write and iterate tests, validate user journeys in the browser             | `01-test`, `02-test-journey`                                                     |
| `07-refactor`   | Improve code without changing behavior across four axes                    | `01-performance`, `02-security`, `03-cleanup`, `04-architecture`                 |
| `08-debug`      | Reproduce and fix bugs with a test-driven workflow                         | `01-reproduce`, `02-debug`, `03-reflect-issue`                                   |
| `09-for-sure`   | Iterative loop that retries until a success condition is met               | `01-init-tracking`, `02-auto-accept`, `03-autonomous-loop`                       |
| `10-todo`       | Split the prompt into independent todos, run one implementer agent per todo in parallel | `01-todo`                                                            |

## 📋 aidd-pm

Product management: ticket retrieval, user stories, PRD, spec.

| Skill                     | Role                                                       | Actions                          |
| ------------------------- | ---------------------------------------------------------- | -------------------------------- |
| `01-ticket-info`          | Retrieve and display ticket information                    | `01-ticket-info`                 |
| `02-user-stories`         | Prioritized, estimated INVEST user-story backlog           | `01-clarify-scope`, `02-split-epic`, `03-draft-stories`, `04-estimate-impact`, `05-prioritize`, `06-sync-tracker` |
| `03-prd`                  | Generate a structured Product Requirements Document        | `01-prd`                         |
| `04-spec`                 | Generate or refine a normalized project spec               | `01-build`, `02-refine`          |

## 🪞 aidd-refine

Meta-cognition: brainstorm, challenge, condense, blind-spot scan, fact-check.

| Skill              | Role                                                        | Actions                                                                                       |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `01-brainstorm`    | Clarify a vague product or technical intent through natural discovery | `01-capture`, `02-probe`, `03-integrate`, `04-finalize` |
| `02-challenge`     | Rethink prior work to verify correctness against a plan    | `01-challenge`                                                                                |
| `03-condense`      | Toggle terse output mode and report token savings          | `01-condense`, `02-stats`                                                                     |
| `04-shadow-areas`  | Scan a markdown artifact for blind spots                   | `01-detect`, `02-render-report`, `03-diff`                                                    |
| `05-fact-check`    | Verify factual claims against sources and cite them        | `01-identify-claims`, `02-verify`, `03-report`                                                |

## 🌿 aidd-vcs

Version-control workflows: repo init, commit, pull/merge request, release tag, issue.

| Skill             | Role                                                                            | Actions                 |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------- |
| `00-repo-init`    | Initialize a repo: git init, default branch, bootstrap commit, optional remote  | `01-init`, `02-publish` |
| `01-commit`       | Create an atomic conventional commit                                            | `01-commit`             |
| `02-pull-request` | Create a draft pull or merge request                                            | `01-pull-request`       |
| `03-release-tag`  | Cut a semver release with annotated tag and notes                              | `01-release-tag`        |
| `04-issue-create` | Create an issue in the configured ticketing tool                               | `01-issue-create`       |

## 🎼 aidd-orchestrator

Optional. Runs the SDLC asynchronously on labeled issues (webhook or cron). Most projects do not need it.

| Skill            | Role                                                  | Sub-flows                 |
| ---------------- | ----------------------------------------------------- | ------------------------- |
| `00-async-dev`   | Single entry point for the async-dev pipeline         | `setup`, `run`, `review`  |

## 🎨 aidd-ui

🚧 **Alpha — not ready for use.** UI / UX: design, review, and improve frontend interfaces. Currently a smoke-test only.

| Skill      | Role                                      | Actions    |
| ---------- | ----------------------------------------- | ---------- |
| `01-hello` | Smoke-test that confirms the plugin loads | `01-greet` |
