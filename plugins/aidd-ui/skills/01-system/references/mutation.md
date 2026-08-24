# System mutation protocol

1. Acquire `.aidd-ui-systems.lock` at the project root with an atomic directory create before re-reading or writing mutable state.
2. Stop when the lock directory exists. Remove only the lock directory created by this operation.
3. Re-read the current contract and affected delta under the lock, then validate the requested transition.
4. Render changed bodies to sibling temporary files on the same filesystem.
5. Create immutable history with an exclusive create. If the path exists, require its body to match exactly.
6. Replace each current file by atomic rename. Create `.history/` only when a prior revision must be archived.
7. Read back every result before releasing the lock.

The project-root lock works before the systems directory exists and serializes scope checks across different ids. Promotion writes the contract before the delta. If interrupted between them, a retry may finish only when the current contract exactly matches the revision rendered from that delta. Any other mismatch stops for reconciliation.
