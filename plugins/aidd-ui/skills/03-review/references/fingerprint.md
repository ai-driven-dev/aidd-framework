# Relevant worktree fingerprint

Return `clean` when the target paths have no tracked or untracked changes.

Otherwise hash these bytes with SHA-256:

1. `git diff --binary HEAD -- <target paths>`.
2. each untracked target path in bytewise path order.
3. a null byte, the project-relative path, a null byte, and the file bytes for each path.

Record the resulting lowercase hexadecimal digest.
