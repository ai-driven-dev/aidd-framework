---
target: {project-relative interface target}
commit: {commit id}
worktree_fingerprint: {clean or SHA-256 digest from the skill reference}
ui_contract: {project-relative ui.md path or null}
ui_revision: {positive integer or null}
systems:
  - id: {system-id}
    revision: {positive integer}
reviewed_at: {ISO-8601 timestamp}
normative: false
---

<!-- Fill applicable sections. Remove this comment, every brace, and empty optional sections. -->

# UI Review: {target}

## Coverage

- Assessed: {domains and evidence}
- Unassessed: {applicable domains and missing evidence or provider}

## Findings

### {priority}: {finding}

- Domain: {feature experience, accessibility, or adaptation}
- Provider: {review capability or exact specialist provider}
- Target: {interface target}
- Scope: {affected state or context}
- Evidence: {observable evidence}
- Impact: {user consequence}
- Required behavior: {behavior that must become true, preserved from specialist when applicable}
- Acceptance: {observable pass condition supplied by a specialist, when applicable}
- System impact: {shared impact supplied by a specialist, when applicable}
- Owner: {capability that owns the correction decision}

## Open Evidence

- {missing observation and why it matters}
