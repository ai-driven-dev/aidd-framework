# 01 - Inspect

Pin the interface and evidence being reviewed.

## Input

An existing screen, flow, rendered interface, screenshot, or implementation location.

## Output

An evidence inventory naming the target commit, relevant worktree fingerprint, UI contract revision, system revisions, requirements, observations, paths, and gaps.

## Process

1. **Locate.** Resolve the relevant workspace, interface entry points, task, and requirement source.
2. **Pin.** Record the current commit, exact artifact revisions, and [fingerprint.md](../references/fingerprint.md) digest.
3. **Observe.** Prefer rendered behavior over implementation evidence.
   - Use implementation evidence only for unreachable states.
4. **Compare.** Report contract, implementation, and memory contradictions without resolving them.
   - When neither interface nor requirement evidence can be observed, report the missing evidence and stop.

## Test

| Case | Pass |
| --- | --- |
| Evidence inventory | each item names a path, revision, commit, or runtime observation |
| Dirty worktree | the report pins a reproducible fingerprint of relevant changes |
| Drift | all conflicting sources remain visible |
| No UI evidence | no experience claim is fabricated |
