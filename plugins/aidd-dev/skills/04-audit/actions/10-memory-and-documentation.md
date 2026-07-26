# 10 - Memory

Audit whether maintained project memory still matches code and current usage. Historical task documentation is out of scope. Read-only.

## Input

`aidd_docs/memory/**` or an explicitly supplied memory path, plus current code and configuration.

## Output

`04-memory.md`, following `../assets/audit-template.md`.

## Questions

- Which memory claim is stale, false, or no longer used?
- Which missing current fact would cause a fresh agent to choose incorrectly?
- Which memory statement duplicates and contradicts a canonical source?
- Which command, dependency, boundary, or workflow named in memory no longer exists?

## Process

1. Read the audit contract, question protocol, and Memory pack.
2. If no maintained memory resolves, write the chapter as `skipped`.
3. Prioritise memory that guides architecture, commands, stack, testing, deployment, and critical workflows.
4. Verify each high-impact claim against current code, configuration, manifests, and scripts.
5. Ignore `aidd_docs/tasks/**`, old plans, and historical reviews even when they contradict memory.
6. Report at most five stale or missing facts with the greatest agent-decision impact.
