# 04 - Adopt

Record an implemented shared UI system as an active revision 1 contract.

## Input

An evidence map with no current matching id or ambiguous active scope and implemented shared UI sources.

## Output

`aidd_docs/ui/systems/<system-id>.md` at revision `1`, filled from [system-contract.md](../assets/system-contract.md).

## Process

1. **Require.** Require a canonical shared source or two evidenced use sites.
   - Stop for a current matching id or equal or unorderable active scope overlap.
2. **Draft.** Capture evidenced decisions, source paths, and confirmed fragments from [03-specialize.md](03-specialize.md).
   - Keep defects and evidence gaps outside the contract.
3. **Approve.** Require explicit user approval or an authorized caller mandate for the exact contract.
4. **Lock.** Apply [mutation.md](../references/mutation.md) and repeat the competing-contract check under the lock.
5. **Write.** Fill the asset with `status: active`, `revision: 1`, `supersedes: null`, normalized scope paths, and implementation sources.
6. **Verify.** Read the file back and confirm every decision is supported by current implementation evidence.

## Test

| Case | Pass |
| --- | --- |
| Shared implementation | the active contract cites canonical sources or repeated use |
| Partial system | only confirmed shared surfaces are adopted |
| Specialist defect | it remains outside the accepted contract and is reported |
| Specialist fragment integrated | its provider name and verdict are unchanged |
| Competing contract | adoption stops before writing |
| Nested active scope | a strict child or parent scope remains resolvable by specificity |
| First system | the exclusive lock works before the systems directory exists |
| Concurrent mutation | adoption stops without replacing another writer's result |
| No approval | no active contract is created |
