---
objective: "A regression particular to one build target fails a test, instead of waiting for someone to notice."
status: implemented
---

# Plan: Freeze the nine golden cells

## Why

The golden captures nine target/mode builds and compared exactly one of them — `claude` —
byte-for-byte against its stored baseline. The other eight were stored and never checked.

That is how a copilot-only regression shipped the same day: `claude`'s content rewrite is
the identity, so the one guarded cell was structurally incapable of catching a change in any
other profile's. A guard that cannot fail for eight of nine cases is a guard for one case.

## What freezing found immediately

Three of the eight were already stale, and none of the drift came from the work that
prompted this — each was verified against a binary built at this branch's base, which
produces the same output.

| Cell | Files | Cause |
| ---- | ----: | ----- |
| `codex` | 30 | Codex is the only target that re-serialises skill frontmatter (`stripCodexSkillFrontmatter`), and `serializeFrontmatter` quotes scalars. Its output stopped matching the source bytes the baseline had recorded |
| `copilot:flat` | 2 | The hooks format grew a `version` field and a flattened shape after the baseline was written |
| `codex:flat` | 1 | `.codex/config.toml` |

The stored file has had **one write in its life**, at the migration commit of 2026-07-22.
Every change to codex frontmatter, to the hooks format and to the codex config since then
went unrecorded, because nothing compared them.

## Decisions

| Decision | Why |
| -------- | --- |
| Freeze all nine, not a chosen subset | Any subset repeats the question of which target is allowed to regress unnoticed. The answer that needs no judgement is none |
| Re-baseline the three stale cells rather than treat them as failures | Each was verified to be what already ships; the baseline was wrong, the output was not. Freezing a wrong baseline would fail every run until someone re-baselined it in a hurry, which is worse than recording reality once with the reason |
| Update the values in place, key order preserved | A regenerated file rewrites 186 lines for 33 real changes and buries them |
| Every re-baseline carries its reason in the file's header | The next person to see a red run needs to know whether re-baselining is the answer or the reflex |
