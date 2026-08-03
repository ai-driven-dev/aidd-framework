# 03 - Validate

Check each written agent file.

## Input

The list of files written (from 02).

## Output

A short pass or fail line per agent file.

## Process

1. **Exists.** Confirm each file is on disk at its expected path.
2. **Shape.** Confirm each file matches its target format ([tool-paths.md](../references/tool-paths.md)), a confirmed tool's, or the canonical form in plugin source, and carries the name, description, and body.
3. **Concise.** Confirm the body stays focused on one role.

## Test

- Every agent file exists, carries name and description, and holds the role body.
