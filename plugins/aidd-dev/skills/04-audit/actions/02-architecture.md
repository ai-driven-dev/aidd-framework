# 02 - Architecture

Audit current boundaries, dependency direction, ownership, and decision quality. Read-only.

## Input

Current architecture sources, memory, code structure, and the decision analysis from `11-decisions.md` when this pillar is composed.

## Output

`05-architecture-and-decisions.md`, following `../assets/audit-template.md` with a `## Decision register`.

## Questions

- Where does code diverge from an explicitly current boundary or dependency direction?
- Which module owns unrelated responsibilities or leaks internal details?
- Which choice solves one observed case but leaves the problem class intact?
- Which consequential choice is inferred, weakly supported, or hard to reverse?

## Process

1. Read the audit contract, question protocol, and Architecture and decisions pack.
2. Use only explicitly current architecture records. Ignore old plans and historical task reports.
3. Map observable modules, imports, public surfaces, data flow, and ownership.
4. Compare declared intent with implementation. When no current declaration exists, audit observable coupling without inventing a desired architecture.
5. Apply the generality gate and inspect contradictory evidence.
6. Group symptoms by architectural cause and report at most five findings.

## Test

- Every conformance finding cites both intended boundary and implementation evidence.
- Inferred intent is labelled and cannot produce a conformance finding by itself.
- The decision register records provenance, confidence, generality, reversibility, and evidence.
- `05-architecture-and-decisions.md` contains at most five root findings.
