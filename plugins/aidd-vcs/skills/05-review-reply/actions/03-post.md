# 03 - Post

Show every draft to the user, then post only after explicit confirmation.

## Input

The drafted replies from `draft`.

## Output

The posted comments, each with the id or URL GitHub returned.

## Process

1. **Show.** List every draft next to the thread it answers and wait for the user's go-ahead.
2. **Post inline.** For a review comment: `gh api repos/{owner}/{repo}/pulls/{pr}/comments --method POST --field body="..." --field in_reply_to={comment_id}`.
3. **Post general.** For a general review thread: `gh pr comment {pr} --body "..."`.
4. **Report.** Echo back what was posted and where.

## Test

- No `gh api` or `gh pr comment` post runs before the user has confirmed the shown list.
- Each posted reply's id or URL is reported back to the user.