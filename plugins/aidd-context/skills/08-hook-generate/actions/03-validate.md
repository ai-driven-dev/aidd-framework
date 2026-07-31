# 03 - Validate

Check the written hook against the contract, per tool.

## Input

The list of paths touched (from 02).

## Output

A short pass or fail line per tool, plus the script.

## Process

1. **Parse.** Confirm each target file still parses in its format and the entry sits at the right key for its scope.
2. **Moment.** Confirm the event name is the right one for that tool's moment, and the matcher is well-formed ([tool-paths.md](../references/tool-paths.md)).
3. **Blocking.** If the hook blocks, confirm the moment can block on that tool ([tool-paths.md](../references/tool-paths.md)).
4. **Script.** For a script-backed handler, confirm the script exists, is executable, and reads stdin and signals per the contract.

## Test

- Each target file parses with the entry under the correct key.
- Each event name matches the tool's moment, and any blocking hook sits on a moment that can block.
