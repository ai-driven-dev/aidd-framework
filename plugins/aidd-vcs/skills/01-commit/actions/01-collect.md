# 01 - Collect

Review the working change and stage what belongs in one atomic commit.

## Input

Optional paths to restrict the commit, the changes made during the current conversation, and the mode (`interactive` default, or `auto`).

## Output

An ordered commit plan and the staged set for its first concern.

## Process

1. **Resolve.** Determine the authorized change set in this order: explicit paths, already staged changes, then changes made during the current conversation.
   - Never add other unstaged changes merely because they are present.
   - When conversation ownership or the requested scope is ambiguous, ask in `interactive`; stop with the ambiguity in `auto`.
2. **Group.** Review the authorized diff and build an ordered plan with one concern per commit.
3. **Pick.** Stage the first concern only. Keep an existing atomic staged set as-is; otherwise stage exact paths or use `git add -p` when a file contains several concerns.
4. **Confirm.** In `interactive`, show each proposed split with its scope and reason, then wait for approval. In `auto`, proceed only when every split is unambiguous.

## Test

- The staged set covers one concern, nothing unrelated.
- Files the user did not name or stage are left untouched.
- Ambiguity is surfaced, never resolved by silently staging more files.
- When all authorized changes are requested, distinct concerns remain distinct commits.
