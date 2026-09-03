---
objective: "The CLI stops carrying a second way to register a marketplace, and its contract stops promising one."
status: implemented
---

# Plan: Leave the registration to the tools that do it

## The decision this closes

Phase 4 of the uncovered-mutants work found 75 mutants in a branch no shipped profile takes,
and refused to write tests there: retire it or keep it is a decision about tool profiles, not
a question a mutation report answers.

The decision is to retire it, on the rule phase 5 of the context refactor already set —
drive the tool's own command where it offers one, and do not rebuild badly what it does well.

`syncMarketplacesFile` had two paths. One drove nothing and wrote the tool's settings file
itself, merging a marketplace entry into whatever was already there. The other returned
early, leaving the registration to the tool's CLI. Established by running the condition over
the five registered profiles: **all five take the early return**. claude, copilot and codex
declare a native plugin CLI; cursor and opencode declare no marketplace settings at all.

## What was checked before removing anything, and why that list is the point

Deleting a path the tool covers is right. Deleting a path the tool does *not* cover is a
regression that no compiler catches. Two things survived that check:

| Kept | Because |
| ---- | ------- |
| `toEntry` | It is called from `mergeEnabledPlugins` too — the live path. Claude registers its own marketplaces but does **not** write `enabledPlugins`; this CLI does, and the existing test says so (`enablesPlugins: false`). Removing it with the merge would have broken plugin activation |
| The marketplace build | `builtSourcesForTool` returned a map that only the merge read, but the build itself must happen whoever registers — including on a machine where the tool's CLI is absent and activation stops short. It became `buildAllForTool`, which builds and returns nothing |

## The contract narrowed with the code

`marketplacesSettingsPath` documented three answers. The first — `undefined`, "into
`settingsPath` alongside the rest" — described the era when this CLI wrote the registration
itself. It is now `string | null`.

`toEntry`'s array shape had no producer at all: the single entry builder returns a map. Gone,
with the `valueShape` discriminant that existed to tell the two apart.

A contract promising more than the code delivers is legacy wearing the costume of generality.

## Verified

| Path | Result |
| ---- | ------ |
| `setup` + `plugin install` + `sync`, five tools, tool CLIs **present** | identical — cursor 47 files, copilot 246, codex 48, opencode 46; claude identical but for the absolute path, which the tool writes itself |
| `setup` + `plugin install`, claude, tool CLI **absent from PATH** | identical, 247 files, built tree present on both sides |
| delete `settings.local.json`, then `marketplace refresh` + `doctor` | restored on both sides, identical but for the path |

The third is the one that mattered. `doctor` tells the user to run `aidd marketplace refresh`
to write the file back; had that recovery run through the deleted merge, `doctor` would have
started giving advice that no longer worked.

168 lines removed against 40 added, across three files.

## What this proof does not cover

`update`, `clean` and `framework remove` were not exercised. And a profile that dropped its
`nativeActivation` tomorrow would no longer have a registration written for it — that is the
decision, not an oversight, and it is why the contract now says so out loud.

The Windows path normalisation (`replace(/\\/g, "/")`) went with the merge. Nothing is lost,
its only consumer leaving with it, but it is written here rather than left to be discovered.
