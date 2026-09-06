---
status: done
---

# Clean removes the state it wrote

## The defect

`aidd clean --force` prints `Cleaned all AIDD files` and leaves `.aidd/marketplaces.json`
behind, so `.aidd` survives a run that said it had removed everything. Reproduced on the
built binary, sandboxed `HOME`:

```
$ node dist/cli.js marketplace add local <path> --yes
Marketplace 'local' registered.
$ ls -A .aidd
cache  manifest.json  marketplaces.json
$ node dist/cli.js clean --force
Cleaned all AIDD files (1 files removed)
$ ls -A .aidd
marketplaces.json
```

The smoke harness has been reporting this as `.aidd survived clean` on every run.

## The cause

`removeAiddState` deletes `.aidd/cache`, `.aidd/plugin-cache` and the manifest, then removes
`.aidd` only if nothing is left in it. The project-scope marketplace registry is never in
that list, so the directory is never empty once a marketplace has been registered.

## The rule this follows

`clean-use-case.ts` already states it: *"config.json is the committed telemetry switch: a
file clean did not write, so clean never removes it."* `marketplaces.json` is the opposite
case — the CLI wrote it itself, at project scope, and nobody commits it. It goes.

A user-scope registry lives outside the project and is untouched, as it was before.

The filename now lives once, in `paths.ts` beside `AIDD_CONFIG_FILENAME`, and both the
adapter that writes it and the use-case that removes it read it from there. A second
spelling is how one of them forgets.

## Guards

| Guard | Mutation that kills it |
| --- | --- |
| `clean --force` removes the registry and leaves no `.aidd` | drop the deletion (unit + e2e, 3 failures) |
| `config.json` is still kept when a registry lived beside it | delete the whole directory instead |

Gates: 3422 tests / 307 files, `tsc`, `biome ci`, knip, bundle within budget.
