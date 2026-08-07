---
name: 04-issue-create
description: Create an issue in the configured ticketing tool. Use when the user wants to file a bug, open an issue, or report a problem. Not for committing, opening a pull request, or commenting on an existing issue.
argument-hint: problem
---

# Issue Create

Files well-formed issues in the configured tracker after gathering enough context to be actionable.

## Actions

| #   | Action          | Role                                                                       | Input                                  |
| --- | --------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| 01  | `issue-create`  | Detect tool, fill template, validate, open the issue                        | problem_description, labels, type      |

Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Detect the ticketing tool from project memory first, then fall back to inferring it from the remote URL.
- Tool-agnostic: invoke whichever ticketing tool is configured for the project.
- Always wait for explicit user approval of title, body, labels, type, projects, and milestones before creating.
- Issue body follows `assets/issue-template.md`.
- Be thorough and concise. Short sentences. Focus on clarity, reproduction steps, and expected behavior.
- Read `assets/CONTRIBUTING.md` for project-specific issue rules before drafting.

## Assets

- `assets/issue-template.md`: Issue / ticket body template.
- `assets/CONTRIBUTING.md`: Contribution guidelines, including issue process.
