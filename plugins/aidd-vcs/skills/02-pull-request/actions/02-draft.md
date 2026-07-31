# 02 - Draft

Write the request title and body from the change.

## Input

The collected base, commits, and changed files from `01-collect`, and optional title or body overrides.

## Output

The proposed title, body, and base, approved by the user.

## Process

1. **Template.** Load the request template, the project's own when set, else the bundled [pull_request.md](../assets/pull_request.md).
2. **Write.** Draft a concise title and a body following the template from the change summary.
3. **Confirm.** Show the title, body, and base, apply any overrides, and wait for approval.

## Test

- The body follows the project's template sections when one exists.
- The user approved the title, body, and base before creation.
