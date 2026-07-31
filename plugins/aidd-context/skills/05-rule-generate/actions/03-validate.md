# 03 - Validate

Check each written rule file against the contract.

## Input

The list of files written (from 02).

## Output

A short pass or fail line per rule file.

## Process

1. **Exists.** Confirm each file is on disk at its expected path.
2. **Contract.** Validate the file against [rule-authoring.md](../references/rule-authoring.md).
3. **Target.** Validate target path and frontmatter against [tool-paths.md](../references/tool-paths.md).
4. **Report.** Emit one pass/fail line per file.

## Test

Every written rule file has one pass/fail result against both referenced contracts.
