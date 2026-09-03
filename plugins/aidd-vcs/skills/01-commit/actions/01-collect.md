# 01 - Collect

Review the working change and stage what belongs in one atomic commit.

## Input

Optional paths to restrict the commit, and the mode (`interactive` default, or `auto`).

## Output

The staged set for one commit, and the concern it covers.

## Process

1. **Read.** Look at the diff and group it by concern.
2. **Pick.** Stage the files for one concern. With explicit paths, stage exactly those; otherwise keep what is already staged, never adding unstaged files on your own.
3. **Split.** When several concerns are mixed, stage one at a time with `git add -p`. In `interactive`, propose each split (its scope and why) and wait for approval.

## Test

- The staged set covers one concern, nothing unrelated.
- Files the user did not name or stage are left untouched.
