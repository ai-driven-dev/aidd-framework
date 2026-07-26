# 01 - Collect

Confirm the local branch matches the pull request, then gather every open review comment.

## Input

An optional PR number or link from the user.

## Output

The list of comments still needing a fix, each with id, author, path, line, body, and `diff_hunk`.

## Process

1. **Resolve.** Use the PR number the user gave, else detect it with `gh pr view --json number`.
2. **Match branch.** Run `gh pr view {pr} --json headRefName,baseRefName,state` and `git branch --show-current`; if they differ, tell the user and stop.
3. **Fetch.** Run `gh api repos/{owner}/{repo}/pulls/{pr}/comments --jq '.[] | select(.user.login != "Copilot" and (.user.type // "User") != "Bot") | {id, path, line, user: .user.login, body, diff_hunk, in_reply_to: .in_reply_to_id}'`.
4. **Drop resolved.** Exclude a thread already answered with a visible fix in `git log` for the file it targets.

## Test

- Run on a PR whose local branch is checked out elsewhere: the mismatch is reported and the run stops before fetching.
- The output excludes any comment already answered by a real code change.