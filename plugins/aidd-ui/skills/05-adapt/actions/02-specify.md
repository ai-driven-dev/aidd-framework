# 02 - Specify

Define required interface transformations across contexts.

## Input

The proposal, invariant task hierarchy, and evidence from [01-inspect.md](01-inspect.md).

## Output

Requirement fragments conforming to [fragments.md](../references/fragments.md).

## Process

1. **Preserve.** Keep the feature's primary task and required information available.
2. **Transform.** Define applicable stacking, collapse, wrapping, persistence, density, overflow, overlay, and input changes.
3. **Reuse.** Apply pinned breakpoints and layout primitives before reporting system impact.
4. **Describe.** Use available space and input capability, not arbitrary device models.

## Test

| Case | Pass |
| --- | --- |
| Fragment produced | every required field and observable acceptance condition is present |
| Existing breakpoint fits | no system impact is claimed |
| New breakpoint needed | an evidenced failure at existing breakpoints is named |
| Overflow adapts | content access and interaction remain explicit |
