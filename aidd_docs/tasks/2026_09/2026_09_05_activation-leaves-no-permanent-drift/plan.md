---
status: done
---

# Activation leaves no permanent drift

## The defect

`MarketplaceSyncSettingsUseCase.execute` ran in this order:

1. `syncTool` writes `.claude/settings.json` and hashes what it wrote into the manifest.
2. `manifestRepo.save(manifest)`.
3. `activateNativeTools` shells out to `claude plugin marketplace add` and
   `claude plugin enable`.

Step 3 writes into the same file step 1 hashed. Claude Code declares
`settingsPath: ".claude/settings.json"` and **no** `enabledPluginsSettingsPath`, so both
halves land there, and the file is hash-tracked (`syncEnabledPluginsFile` tracks it precisely
because the two paths coincide).

Nothing re-read it. The tracked hash described content that stopped existing the moment
activation succeeded, so:

- `status` and `doctor` reported a file the person never touched as drifted, for as long as
  the manifest stood.
- `restore` would have undone the host's own registration to reach a state AIDD held for the
  length of one function.

## How it was confirmed, and the wrong answer that came first

The first probe **passed**, and it was vacuous: the fake activator wrote
`enabledPlugins: { <ref>: true }`, which is exactly the key `mergeEnabledPlugins` had already
written, so the content was byte-identical and the hash matched by coincidence.

Replacing it with a key this code never writes — the host's own bookkeeping — turned the
probe red. That is the difference between a passing test and a test that checks anything.

## The change

After activation, re-read the settings file and store what is there, for the tools whose own
CLI actually ran. `activateTool` now answers whether it drove the CLI, and only those tools
are re-hashed.

**Only those tools.** A tool whose binary is absent wrote nothing, so a settings file that
differs from its tracked hash differs because a person changed it — the drift `status` exists
to report and `restore` exists to undo. Re-hashing every installed tool would bless that as
ours and make the person's change permanent and invisible.

Re-read rather than re-derived: what is stored is what is on disk after the write, an
observation, not a guess at what the host would have written.

## Guards

| Guard | Mutation that killed it |
| --- | --- |
| the tracked hash matches the file after the host CLI has written to it | drop the re-hash — the code as it was — 1 |
| a hash is left alone for a tool whose own CLI never ran | re-hash every installed tool — 1 |

The second is what keeps the first honest; without it the fix would be indistinguishable from
"always trust the file".
