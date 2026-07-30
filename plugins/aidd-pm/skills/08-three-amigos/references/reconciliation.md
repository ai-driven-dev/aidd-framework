# Reconciliation

1. Merge findings only when their claims are equivalent; retain every role and evidence pointer.
2. Preserve distinct findings even when they touch the same section.
3. Surface contradictory claims together and ask the user; never rank a lens as authoritative.
4. Propose an amendment only when evidence or an explicit user decision determines it.
5. Keep unresolved questions open. Never convert silence, majority, or severity into approval.

The result records the target, snapshot, verdict, confirmed findings, conflicts, proposed amendments, and open questions. It is `blocked` when an unresolved conflict or question prevents revision, `revise` when amendments remain, and otherwise `ready`. Every amendment includes `before`, `after`, finding ids, and evidence.
