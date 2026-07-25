# 05 - Performance and reliability

Find material slow paths, amplification, silent failure, and missing recovery without running a general E2E flow. Read-only.

## Input

Target code, current budgets when defined, and existing profiler, build, bundle, query, CI, or telemetry artifacts.

## Output

`09-performance-and-reliability.md`, following `../assets/audit-template.md`.

## Questions

- Which path repeats I/O, loads unbounded data, or performs avoidable heavy work?
- Which file, asset, dependency, or initialization path materially affects build, startup, or runtime?
- Which failure becomes worse through retries, fan-out, missing timeouts, or absent backpressure?
- Which important failure is invisible or unrecoverable?

## Process

1. Read the audit contract, question protocol, and Performance and reliability pack.
2. Inspect static call paths and existing measurements first: N+1 patterns, unbounded reads, repeated serialization, synchronous heavy work, large bundles, retry loops, timeouts, and recovery.
3. Prefer a stated budget or existing measurement. A clear complexity argument may support a finding; otherwise record a hypothesis or unknown.
4. Do not launch the site, generate a new profile, or run E2E by default.
5. A bounded runtime probe must pass the critical escalation gate in `audit-contract.md`.
6. Report at most five material findings.

## Test

- Every bottleneck finding cites measurement or a decisive complexity path.
- “Large” is compared with a project budget, artifact, or meaningful consequence.
- Reliability findings name the failure mode and missing detection or recovery.
- No general runtime or E2E flow runs.
