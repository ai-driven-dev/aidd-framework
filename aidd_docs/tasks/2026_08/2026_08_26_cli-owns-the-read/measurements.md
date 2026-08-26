# Measurements

## Phase 1 — the confrontation with data the code has never seen

The committed fixture is synthetic, so it agrees with the code that reads it. This is the
step that does not: the deleted script and the CLI, run over the machine's own sink, whose
records nobody authored for this test.

Run 2026-08-26, on a sink holding 34 records across five tools, three days, four steps and
both record kinds. The script was restored from git into a temporary directory for the
comparison, and removed after it.

```
report --json          identical
report --axis total    identical
report --axis day      identical
report --axis model    identical
report --axis project  identical
report --axis step     identical
report --axis tool     identical
```

Every rendering the two share is byte-identical on real data. Nothing was recorded to fix.

## What the fixture cannot show, and why

Two fields are absent from the committed envelope by construction, and are declared
conditional rather than asserted:

- `cost_micro_usd` — present only once a record states an amount. No tool read locally
  writes one, which is why every figure reads `amount unknown`.
- `task`, `task_attribution`, `filters`, `empty_selection`, `active_time_s` — present only
  under a selection.

Their presence and shape are pinned by the CLI's own envelope tests. What
`scripts/__tests__/aidd-telemetry-cost-skill.test.js` pins is narrower and still worth
having: the skill names no envelope field that exists nowhere at all.

## A coverage gap this phase opened, and where it is closed

`--axis` did not exist on the CLI. The skill's markdown named it, the CLI refused it, and it
was caught before anything was deleted — by the check that every command the skill names is
one the CLI accepts. It is now `cost-report-artefact.ts`, byte-identical to the script's own
rendering on all six axes, on both the synthetic fixture and the real sink above.

Two suites moved out of `scripts/__tests__/aidd-telemetry-identity.test.js` and into phase 2:
*"what a default install actually stores, proven from the stored bytes"* and *"a choice made
today does not reach backwards"*. Both drove `read` through the deleted reporter. Until phase
2 restores them against `aidd telemetry read`, the behaviour is pinned one level down, in
`read-local-cost-use-case.unit.test.ts`. That is real coverage, and it is not the same as
reading the bytes.
