---
name: master_plan
description: Parent plan orchestrating the four child plans that make Gemini CLI a first-class AIDD tool
argument-hint: N/A
---

# Master Plan: Gemini CLI as a first-class AIDD tool

## Overview

- **Goal**: Gemini CLI becomes a full tool-registry citizen (build target + install/uninstall/update/restore/doctor/status), with skills, agents, MCP, hooks and `AGENTS.md` natively wired.
- **Risk Score**: 8/10 (published archive content changes +3, 5+ modules affected +3, generalization of two opencode hardcodes +2)
- **Branch**: `feat/511-gemini-cli-tool/`
- **Source**: [issue #511](https://github.com/ai-driven-dev/framework/issues/511), refined in `./brainstorm.md`
- **Marketplace mode**: out of scope. Gemini CLI has no plugin-manager equivalent.

## Surface mapping (verified, not assumed)

Every row below was checked against Gemini CLI 0.52.0 installed locally (`gemini --version`), against strings extracted from the shipped bundle, and against the official docs at `main`. The issue's original mapping is wrong on three rows and must be rewritten (part 4).

| AIDD surface | Gemini CLI target | Evidence |
| --- | --- | --- |
| Skills | `.agents/skills/aidd-<skill>/SKILL.md` | `gemini skills list --all` discovers a probe skill placed there. Alias documented, and it takes precedence over `.gemini/skills/` |
| Agents | `.gemini/agents/<name>.md` | `getProjectAgentsDir() = geminiDir/agents`. No `.agents/agents` alias exists |
| MCP | `mcpServers` in `.gemini/settings.json` | Same key as the AIDD source `.mcp.json`, no shape transform needed |
| Hooks | `hooks` in `.gemini/settings.json` | Official Claude to Gemini event table shipped in `gemini hooks migrate` |
| Rules / context | `AGENTS.md`, made readable via `context.fileName` | `AGENTS.md` appears nowhere in the shipped bundle, so it is not read by default. `settings.context.fileName` feeds `setGeminiMdFilename` |
| Commands | none | Out of scope for every AIDD target. A framework-build limitation, not a Gemini one |

## Corrections to the brainstorm's risk list

Four of its nine risks were wrong or mislocated. Recorded here so no child plan re-litigates them.

| Brainstorm risk | Verdict |
| --- | --- |
| 1. Uninstalling codex deletes the shared skills tree | **Mislocated.** `uninstall-tools-use-case.ts:201-213` already guards shared paths. The unguarded path is `uninstall-plugin-use-case.ts:62-74`. Owned by part 2 |
| 3. `context.fileName` merge strategy undefined | **Downgraded.** `setGeminiMdFilename` unions rather than replaces, so `GEMINI.md` is never lost. The residual problem is our own writer needing array union under user-prime. Owned by part 1 |
| 4. Hook mapping unverified event by event | **Resolved.** AIDD ships exactly two hooks, both mapping cleanly. Kept in scope, no longer best effort |
| 5. Detection ambiguity via `detectUserFileSectionKey` | **Not a live mechanism.** Five implementations, zero callers in `src/`. There is no sync command. Documented, not fixed |
| 6. CI cost 5x5 to 6x6 | **Wrong shape.** No such automated matrix exists. Real cost is 9 to 10 build cells and a 4x4 to 5x5 unit suite |

## Constraints discovered during planning

Neither appears in the issue or the brainstorm, and both gate the stated success criterion.

- **Minimum Gemini CLI 0.28.0.** The `.agents/skills/` alias does not exist before it. Skills need 0.24.0, markdown agents 0.25.0, the full hook event set 0.21.0.
- **Folder trust.** In an untrusted folder Gemini prints `Skipping project agents due to untrusted folder` and `Project hooks disabled because the folder is not trusted`, and lists zero project skills. Unzipping the archive is not sufficient. The user must trust the folder, or `security.folderTrust.enabled` must be false.

## Child Plans

| #   | Plan                    | File                                             | Status  | Validated |
| --- | ----------------------- | ------------------------------------------------ | ------- | --------- |
| 1   | Build target            | `./2026_07_27-511-gemini-cli-tool-part-1.md`      | done    | [x]       |
| 2   | Shared tree safety      | `./2026_07_27-511-gemini-cli-tool-part-2.md`      | done    | [x]       |
| 3   | Registry citizen        | `./2026_07_27-511-gemini-cli-tool-part-3.md`      | done    | [x]       |
| 4   | Content and docs        | `./2026_07_27-511-gemini-cli-tool-part-4.md`      | done    | [x]       |

<!-- Status values: pending, in-progress, done, blocked -->
<!-- RULE: Plan N+1 blocked until Plan N checkbox checked -->

Each part is independently shippable:

- Part 1 alone closes the literal ask of issue #511 (a `gemini` flat archive).
- Part 2 is a pre-existing bug fix, valuable with or without gemini.
- Part 3 turns the build target into a registry citizen.
- Part 4 carries the deliberate golden re-baseline and the documentation debt.

## Cross-cutting decisions

Taken during planning, binding on every child plan.

| Question | Decision | Reason |
| --- | --- | --- |
| `aidd-orchestrator` under Gemini | Excluded from the gemini target | Structurally Claude-coupled: `enabledPlugins` in `.claude/settings.json` and the Claude Code GitHub Action have no Gemini equivalent. Neutralizing the wording would leave a skill that cannot run |
| Who writes `.gemini/settings.json` | Three logical writers (settings seed, MCP, hooks), all in merge semantics, all delegating to one authority module. No `configOutputPaths` | `buildConfigFiles` skips an existing untracked file with only a warning (`install-runtime-config-use-case.ts:84,130-139`). Every real Gemini user already has that file, so `context.fileName` would silently never land |
| Existing golden cells | Byte-identical in parts 1 to 3. Re-baseline isolated in part 4 | `actions/05-build-contract.md` mandates byte-identical existing-target output against a pre-change baseline |
| Skills rendering for gemini | Identical to codex, producing a byte-identical subset of codex's `.agents/skills/**` | Removes the hash-divergence failure mode on co-owned paths instead of managing it |
| Plugin exclusion mechanism | `shouldBuildPlugin(name)` on `BuildOutputStrategy`, fed by the contract | Keeps zero per-tool branches in the orchestrators, as the `tool` skill requires |
| Standalone operation without codex | Required, and validated | Verified in part 1 phase 5 and part 3 phase 4, both in a project where codex is absent. The `.agents/` tree is an official Gemini alias, not a codex artifact |

This supersedes one brainstorm decision. The brainstorm chose tool-neutral skill content (its option A), accepting that codex output changes. Excluding `aidd-orchestrator` removes the need for the hard part of that work: all nineteen real Claude-specific runtime paths live in that one plugin. What remains is additive, adding a gemini row to ten multi-tool tables, which still changes codex output and still needs the re-baseline. The intent of option A holds; its cost drops.

## Validation Protocol

1. Complete Part 1, run its `success_condition`
2. [x] Checkpoint 1: gemini archive builds, 9 existing golden cells byte-identical
3. Unblock Part 2, run its `success_condition`
4. [x] Checkpoint 2: shared-path deletion guarded, subset invariant green
5. Unblock Part 3, run its `success_condition`
6. [x] Checkpoint 3: full command matrix green for gemini, smoke coverage gate met
7. Unblock Part 4, run its `success_condition`
8. [x] Final: a Gemini-only project consumes the archive end to end, verified against the real `gemini` binary

## Confidence assessment

**9/10.**

Reasons for confidence:

- Every surface claim was verified against Gemini CLI 0.52.0 running locally, not inferred from documentation. Skill discovery under `.agents/skills/` was reproduced; the hook event mapping and the strict agent frontmatter schema were extracted from the shipped binary. The project's testing memory records that doc-plus-code inference was wrong twice before on exactly this kind of question.
- The lifecycle is overwhelmingly registry-driven. The set of files that genuinely need editing is enumerated with line references, and the compile-hard ones (the exhaustive config-asset record, the id union) fail loudly rather than silently.
- Two existing tools bracket gemini's shape: codex supplies the shared skills tree, opencode supplies the flat-only, no-marketplace citizen. Little is unprecedented.
- The riskiest failure mode, two tools writing different bytes to one shared path, is eliminated by construction rather than managed, and the invariant is asserted in the golden suite.
- Every part has a runnable success condition and each is independently shippable.

Remaining risks:

- The three-writer arrangement on `.gemini/settings.json` has no precedent in the codebase. Codex splits MCP and hooks across two files; opencode has no hooks. If the merge authority proves insufficient, part 1 phase 2 may need a fourth writer removed rather than added.
- Minimum-version numbers are source-derived. The vendor publishes none, so a stated minimum could be off by a release.
- Flat mode skips plugin hooks on the install path while the archive path merges them. That asymmetry predates this work, applies to opencode too, and is documented rather than fixed here.
- Folder trust cannot be satisfied by the archive. It is a documentation-only mitigation, so a user who skips the step sees an empty skill list with no explanation from AIDD.
- Part 3 refactors a path opencode depends on. The existing opencode suites are the only regression net; if their coverage is thinner than it looks, a regression could ship.

## Estimations

- **Confidence**: 9/10
- **Duration**: 4 sessions, one per part
