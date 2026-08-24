# UI system authority

## Evidence priority

1. explicit user requirement.
2. approved delta for authorized future behavior.
3. active UI system contract for accepted shared decisions.
4. repository code for implemented behavior.
5. project memory as a compact summary.
6. external design documents as supporting evidence.

Code wins against memory. Contract and code differences remain visible until reconciliation.

## Difference classes

| Class | Meaning |
| --- | --- |
| approved pending change | code has not implemented an approved delta |
| conforming implementation | code satisfies the active contract or approved delta |
| unauthorized code drift | code changed shared behavior without authority |
| stale contract | accepted contract no longer represents intended behavior |
| stale memory | memory conflicts with current repository evidence |
| external-document mismatch | supporting design evidence conflicts with authority |
| scope conflict | contracts match the same target without a unique owner |
