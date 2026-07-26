# 01 - Collect

Resolve the pull request and gather every human review comment, bots and already-answered threads filtered out.

## Input

An optional PR number or link from the user.

## Output

The list of threads to answer, each with id, author, path, line, body, and whether it is inline or a general review comment.

## Process

1. **Resolve.** Use the PR number the user gave, else detect it with `gh pr view --json number`.
2. **Fetch inline.** Run `gh api repos/{owner}/{repo}/pulls/{pr}/comments --jq '.[] | select(.user.login != "Copilot" and (.user.type // "User") != "Bot") | {id, user: .user.login, path, line, body, in_reply_to_id}'`.
3. **Fetch general.** Run `gh api repos/{owner}/{repo}/pulls/{pr}/reviews --jq '.[] | select(.user.login != "Copilot" and (.user.type // "User") != "Bot") | {id, user: .user.login, state, body}'`.
4. **Group.** Merge several comments from the same author on the same file or subject into one thread entry.
5. **Skip answered.** Drop a thread that already carries a reply from the current user.

## Test

- Run against a real PR carrying at least one Copilot or bot comment: the output excludes it.
- A thread already replied to by the user is absent from the output.