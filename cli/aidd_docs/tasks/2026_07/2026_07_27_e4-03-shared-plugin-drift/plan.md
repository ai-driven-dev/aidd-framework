---
objective: "status and doctor detect plugin drift through one implementation."
status: implemented
---

# Plan: US-E4-03 — extract the shared plugin diff

| Field      | Value                                                    |
| ---------- | -------------------------------------------------------- |
| **Source** | `epic-E4-status-doctor-accuracy.md` (B3) |

## Verification of B3 — confirmed, with one divergence resolved

`StatusUseCase` (`checkAllPlugins` / `checkPluginsForTool` / `resolvePluginBaseDir` / `checkOnePluginDrift`) and `DoctorPluginUseCase` (`execute` / `checkPluginsForTool` / `resolveBaseDir` / `checkOnePlugin`) each carried the same four-step shape: select the tool's plugins, filter by an optional name, resolve the plugin base dir off `PluginsCapability`, then compare every manifest file against disk.

The two base-dir resolvers looked like they disagreed:

```ts
// status
if (pluginsCap.installScope !== "user") return projectRoot;
return pluginsCap.resolvePluginsBaseDir(projectRoot, nodeHomedir());

// doctor — no installScope guard
return plugins.resolvePluginsBaseDir(projectRoot, homedir());
```

They do not. `PluginsCapability.resolvePluginsBaseDir` already returns `projectRoot` unless `installScope === "user"` **and** a `userPluginsDir` resolver exists, so status's guard was redundant and both produced the same directory. No latent bug, and the extraction is behaviour-preserving.

Doctor's resolver was the better of the two: it narrows with `isAiTool(tool)` and types the capability as `PluginsCapability`, where status hand-rolled a structural cast (`caps.plugins as { installScope; resolvePluginsBaseDir }`). The shared version keeps doctor's.

## Decisions

| Decision | Why |
| -------- | --- |
| New `DetectPluginDriftUseCase` in `use-cases/shared/`, injected into both | Matches the existing shared-collaborator idiom (`resolve-update-decision`, `update-one-tool`). Neither caller can own it: `status` reporting drift through a *doctor* class would invert the dependency. |
| Shared result is per-file `{ relativePath, kind: "missing" \| "hash-mismatch" }`; each caller projects it | The two output shapes genuinely differ — doctor emits one flat `PluginIssueEntry` per file with the kind, status groups per plugin into `driftedFiles: string[]`. Both are derivable from the richer per-file form, so the diff lives once and only the projection differs. |
| Keep `DoctorPluginUseCase` as a thin projection rather than deleting it | Preserves its `PluginIssueEntry` contract and its `allowedIds` selection policy, so `DoctorUseCase` and its tests are untouched. |
| Gate on `files.length > 0` in the shared use-case | Matches both prior behaviours: status only pushed an entry for a drifted plugin, and doctor contributed nothing for a clean one anyway. |
| No new tests | A pure refactor. The classification (`missing` / `hash-mismatch`) is already asserted by the doctor tests and the grouping by the status tests, so a direct test would restate existing assertions. Single-source-of-truth is proven by mutation instead. |

## Verification

- 2105/2105 pass — the same count as before, with no assertion changed. Only construction sites gained the new argument.
- **Single point of truth proven by mutation:** making the shared hash comparison never report drift fails *both* `status-plugin.unit.test.ts` and `doctor-plugin.unit.test.ts` (1 failure each). One edit, both subsystems — which is the property the story asks for.
