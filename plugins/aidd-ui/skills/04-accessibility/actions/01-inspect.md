# 01 - Inspect

Collect accessibility evidence for the target interface.

## Input

An interface proposal or existing interface, its UI system revision when one exists, and the relevant project area.

## Output

The confirmed accessibility bar, interaction model, semantic and state evidence, runtime observations, and evidence gaps.

## Process

1. **Read.** Inspect requirements, shared components, implementation, project-memory pointers, and the pinned UI system when one exists.
2. **Select.** Keep only semantics, keyboard, focus, naming, contrast, errors, labels, target size, announcements, or reduced motion that apply.
3. **Observe.** Use runtime evidence when assessing existing behavior that cannot be proven statically.
4. **Bound.** Classify evidence by the requested mode.
   - `define`: use requirements and repository evidence when no system exists.
   - `assess` or `confirm`: mark unavailable runtime evidence unverified.
   - Any mode: report contract or memory drift without resolving it.

## Test

| Case | Pass |
| --- | --- |
| Existing accessibility bar | its exact system revision and sources are named |
| Runtime unavailable in assess mode | runtime-only behavior is unverified |
| Prospective behavior in define mode | an observable acceptance condition can resolve it without current runtime proof |
| No active system | requirements and repository evidence remain usable |
| Concern irrelevant | it is omitted rather than emitted as boilerplate |
| Drift | conflicting evidence remains explicit and no artifact changes |
