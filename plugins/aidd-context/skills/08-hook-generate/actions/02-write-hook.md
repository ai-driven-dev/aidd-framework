# 02 - Write hook

Render the entry for each confirmed tool, merge it into the chosen scope, and write the backing script.

## Input

From 01: the moment, action, script need, matcher, scope, confirmed tools, and write mode.

## Output

The updated target file per tool, any script written, and the list of paths touched.

## Process

1. **Script.** If the action needs a backing script ([hook-authoring.md](../references/hook-authoring.md)): copy [hook-script-template.sh](../assets/hook-script-template.sh), fill the logic, place it in the scope's script directory ([tool-paths.md](../references/tool-paths.md)), and make it executable. One script can back every tool.
2. **Entry.** Per confirmed tool, fill [hook-template.json](../assets/hook-template.json) from [tool-paths.md](../references/tool-paths.md), using that tool's shape and stripping the scaffold.
   - Point the handler at the script by absolute path or an approved `${VAR}`.
3. **Merge.** For each tool, read the target file and append the entry to the moment's list under the right key for the scope ([tool-paths.md](../references/tool-paths.md)). Preserve every sibling, never overwrite.
4. **Validate.** Run the merge check and write-target validation ([tool-paths.md](../references/tool-paths.md)).

## Test

- Each target file is valid after the merge.
- The new entry is present in each, and every prior sibling survives.
- A script-backed handler's script exists at its path and is executable.
