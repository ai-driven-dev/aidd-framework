# 03 - Experience

Resolve implementation-ready UI decisions for frontend work. Skip when the feature has no interface.

## Input

The gathered source, explore context, and optional feature `ui.md`.

## Output

Prefer one verified current `ui.md` reference with revision, pinned systems, and required deltas. When the alpha UI provider is unavailable, return a compatibility-only low-fidelity wireframe.

## Process

1. **Find.** Inspect the feature's current `ui.md` and reject it while `.ui.lock` exists.
2. **Discover.** Resolve a provider from runtime capability metadata without naming a sibling.
3. **Resolve.** Invoke `create` or `revise` when available, then accept only a current ready contract whose systems and approved or verified deltas resolve at their current bases.
   - Route satisfied approved deltas to system reconciliation and promoted deltas to UI revision.
4. **Fallback.** Draw a structure-only wireframe from [wireframe-conventions.md](../references/wireframe-conventions.md) only when no contract and no provider exist.
   - Stop with `UI revision needed` when a contract exists but no provider can revise it.
5. **Return.** Reference a resolved contract and dependencies without copying decisions, or return the bounded fallback wireframe.

## Test

- Non-UI work skips this action.
- UI work yields one current ready contract with resolvable dependencies.
- A draft, stale, or promoted graph routes to its owning UI operation.
- Provider absence preserves only the compatibility wireframe and creates no UI artifact.
- Provider absence never bypasses an existing draft or stale contract.
