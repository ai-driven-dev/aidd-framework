---
objective: "status and doctor report each scope once, under a label that matches what it actually contains."
status: implemented
---

# Plan: SPIKE-E4-01 + BUG-E4-02 — accurate scopes in status/doctor

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| **Source** | `epic-E4-status-doctor-accuracy.md` (A6, A7, A8) |

## Spike findings (SPIKE-E4-01) — both confirmed

Both `StatusAllUseCase` and `DoctorAllUseCase` ran a third, **unscoped** pass and labelled it `plugins`:

```ts
useCase.execute({ projectRoot, filterToolId: undefined })  // status
doctorUseCase.execute({ projectRoot })                     // doctor
```

Neither is a plugin query — each returns the full report for every tool, which is a strict superset of the two scoped calls that precede it.

**Mislabelling (A6, A7).** The field named `plugins` held a complete report. `status` read only `.pluginDrift` off it and discarded the rest; `doctor` passed the whole thing to `printScopeIssues(…, "Plugins", …)`, so every AI and IDE issue was printed a second time under a "Plugins" heading.

**Redundant recompute (A8).** The third pass re-hashed every tracked file of every tool — work the `ai` and `ide` passes had just done — and `status` then threw the result away.

**Why the third call is unnecessary at all:** plugins hang off AI tools. `checkAllPlugins` iterates the scope's tools and `manifest.getPlugins()` is empty for an IDE tool, so the `ai` scope already carries every plugin entry. Same for doctor's `pluginIssues`.

## Decisions

| Decision | Why |
| -------- | --- |
| Expose `pluginDrift` / `pluginIssues` directly instead of a report labelled `plugins` | The old field promised a scope it never was. Naming the data for what it holds makes the redundant call obviously unnecessary rather than subtly load-bearing. |
| Split plugin rendering out of `printScopeIssues` into `printPluginIssues` | `printScopeIssues` printed both tool issues *and* plugin issues, so plugin issues appeared under "AI" **and** under "Plugins" — a second duplication independent of the extra call. Each now prints in exactly one place, and the three user-facing sections are preserved. |
| Regenerate the golden baseline | It is a behaviour-preserving gate and it fired correctly. The captured diff is a single line: the duplicate `[plugins]` warning drops from stderr. stdout is byte-identical, so the visible report is unchanged. |
