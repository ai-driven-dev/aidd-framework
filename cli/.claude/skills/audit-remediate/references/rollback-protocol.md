# Rollback Protocol

Rollback procedures for the audit-remediate macro. All commands are scoped to the target
layer path to avoid disturbing unrelated uncommitted work.

## Restore uncommitted changes in a specific directory

```bash
git restore <target-layer-path>
```

Example: `git restore src/contexts/tools/domain/formats/`

Reverts all unstaged modifications in the given directory. Does not touch staged changes or
commits. Run `git status <target-layer-path>` to confirm the directory is clean after.

## Restore a specific file

```bash
git restore <path/to/file.ts>
```

## Undo a committed phase (if gate was passed but a later check proves it wrong)

```bash
git revert HEAD --no-edit
```

Creates a revert commit rather than destroying history. Use only for the immediately preceding
commit. Never force-push to shared branches.

## Confirm the tree is clean

```bash
git status <target-layer-path>
```

Expected output after rollback: no modified files listed under `<target-layer-path>`.

## Staged changes

If changes were staged with `git add` before the gate failed:

```bash
git restore --staged <target-layer-path>
git restore <target-layer-path>
```

The first command unstages, the second reverts the working-tree edits.

## When NOT to rollback

- If the gate passes, do not rollback. Commit immediately.
- If the failure is in a file outside `target-layer-path`, do not rollback — investigate the
  external dependency instead.

## Invariants

- Never `git reset --hard HEAD` on a branch others may be tracking.
- Never `git checkout .` (too broad — discards all unrelated work).
- Scope every restore to the exact paths modified in action 03.
