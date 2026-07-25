---
name: question-packs
description: High-leverage questions and evidence targets for the nine core audit pillars.
---

# Question packs

## North Star

- Which critical outcome does the code implement differently from the current North Star?
- What shipped behavior is absent from or contrary to product intent?
- Which technical choice optimises a local concern at the expense of the primary outcome?

Evidence: confirmed North Star sources, routes, commands, schemas, public APIs, critical application paths.

## Rules

- Which active rules fail in code, configuration, tests, or maintained memory?
- Which rules are followed literally but violated in spirit?
- Which two active rules conflict or cannot both be satisfied?

Evidence: exact active rule, scoped target, concrete implementation reference. Evaluate every active rule.

## Memory

- Which maintained memory claim is stale, false, or no longer used?
- Which current architectural fact would mislead a fresh agent because memory omits it?
- Which duplicated memory statement disagrees with its canonical source?

Evidence: `aidd_docs/memory/**` versus current code, configuration, commands, and dependencies. Ignore task history.

## Architecture and decisions

- Where does code cross a declared or observable boundary in the wrong direction?
- Which decision was expedient but local rather than general?
- Which module owns responsibilities that should be separated?
- Which inferred choice is least defensible or hardest to reverse?

Evidence: current architecture sources, dependency graph, imports, public surfaces, data flow, history only when needed to establish a material choice.

## Code hotspots

- Which files or functions concentrate disproportionate size, complexity, churn, duplication, or error handling?
- Which dead paths, vestigial flags, or swallowed errors create material maintenance risk?
- Which abstraction makes common changes touch unrelated areas?

Evidence: file and function size relative to project siblings, static tooling when available, imports, call sites, current TODOs, error paths. Size alone is a lead, not a finding.

## Test value

- Which meaningful risk does each important test group protect?
- What plausible regression would make it fail?
- Which tests stay green while the behavior they claim to protect is broken?
- Which tests duplicate cheaper protection or cost more than their unique signal?
- Which critical behavior has no effective witness?

Classify: `protective`, `redundant`, `brittle`, `ceremonial`, or `misleading`.

Evidence: test assertions, production behavior, fixtures, mocks, CI configuration, existing timing or flake history. Coverage percentage alone proves nothing.

## Security and data

- Where does untrusted data cross a boundary without validation or authorization?
- Which path can disclose, corrupt, overwrite, or silently lose data?
- Which security assumption exists only by convention?
- Which direct dependency creates a material, evidenced trust or supply-chain risk?

Evidence: trust boundaries, schemas, auth gates, persistence, serialization, secrets, security configuration, manifests, lockfiles, and current authoritative scanner artifacts. Do not infer exploitability from names alone.

## Performance and reliability

- Which path repeats I/O, loads unbounded data, performs avoidable heavy work, or amplifies failure?
- Which oversized asset or module materially affects startup, build, or runtime?
- Which failure is invisible because timeouts, retries, logging, metrics, or recovery are absent?

Evidence: static call paths and existing measurements first. Without a measurement or clear complexity argument, report a hypothesis or unknown, not a bottleneck.

## Automation and knowledge infrastructure

- Which issue class has already required repeated human or agent reasoning?
- Which review rejection reveals missing repository knowledge?
- Could a fresh agent choose correctly with zero extra prompt?
- What invariant belongs in code rather than prose?
- What domain guidance belongs in a rule, skill, memory, or canonical document?

Evidence: confirmed cross-pillar findings, repeated patterns, current rules and automation. Rank expected leverage against false-positive and maintenance cost.
