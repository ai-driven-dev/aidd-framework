---
objective: Replace the four near-identical InstallAgents/Commands/Rules/SkillsUseCase classes with one generic content-section installer parameterized by capability, so a fifth content type does not require a fifth copy.
status: implemented
---

# Generic install-section use case

## Background

Four use-cases in `src/application/use-cases/install/` installed one content section
each (agents, commands, rules, skills). All four were read end to end before writing
anything, and diffed directly against each other rather than trusting the ticket's
claimed asymmetries at face value.

## Difference table (four originals, as read)

| Aspect | agents | commands | rules | skills |
|---|---|---|---|---|
| Constructor | `(hasher: Hasher)` | `(hasher: Hasher)` | `(hasher: Hasher)` | `(hasher: Hasher)` |
| `execute()` shape | loop over `contentFiles`, delegate to `processFile` | identical | identical | identical |
| `processFile` filtering (directory prefix, entryFile, gitkeep) | identical | identical | identical | identical |
| `cap.acceptsFileName(...)` arity | **2 args**: `(fileName, ALL_TOOL_SUFFIXES)` — `AgentsCapability` requires the caller to supply all tool suffixes | 1 arg: `(fileName)` — suffix list computed internally by the capability | 1 arg | 1 arg |
| Local `ALL_TOOL_SUFFIXES` constant | defined in the use-case file from `AI_TOOL_IDS` | not needed (capability computes its own) | not needed | not needed |
| `cap.convertFrontmatter(...)` arity | **2 args**: `(fm, relativeFileName)` | **2 args**: `(fm, relativeFileName)` | 1 arg: `(fm)` | 1 arg: `(fm)` |
| `buildFile` receives `relativeFileName` | yes | yes | no | no |
| Serialization call | `cap.serialize(convertedFrontmatter, body)` — capability's own method (branches on `toml` vs `markdown` format internally) | `serializeFrontmatter(convertedFrontmatter, body)` — imported directly from `domain/formats/markdown.js`, bypassing `cap.serialize` | same direct import as commands | same direct import as commands |
| gitkeep handling | identical (`InstallationFile` with empty content, unless `buildInstallPath` returns `null` first) | identical | identical | identical |

## A further difference found (not in the ticket)

The ticket's known asymmetries did not mention that **agents calls `cap.serialize()`
while commands/rules/skills call the imported `serializeFrontmatter()` function
directly**, skipping their own capability's `serialize` method entirely. Reading
`AgentsCapability.serialize`, `CommandsCapability.serialize`, `RulesCapability.serialize`,
and `SkillsCapability.serialize` (`src/domain/capabilities/*.ts`) showed that commands/
rules/skills' own `serialize` methods are trivial wrappers around the same
`serializeFrontmatter` call, so the two call styles are behaviorally identical for those
three. Only `AgentsCapability.serialize` branches on `format === "toml"` to build TOML
content instead. This meant the generic engine could safely call `cap.serialize(...)`
uniformly for all four sections — for agents it preserves the toml branch that direct
`serializeFrontmatter` import would have skipped, and for the other three it is a no-op
change (their own `serialize` produces the exact same output as the direct import). This
was verified by the full test suite staying green, including the toml-format agent
paths.

Ticket's stated asymmetry #2 ("commands threads `relativeFileName` into `buildFile`;
skills does not") checked out, but is incomplete on its own: agents also threads
`relativeFileName` through (its `convertFrontmatter` needs it to derive the agent name
from the filename when frontmatter has no `name` field). The accurate split is
`{agents, commands}` vs `{rules, skills}`, driven directly by each capability's
`convertFrontmatter` arity — not a two-way commands/skills split.

## Shape of the generic implementation

New file `src/application/use-cases/install/install-content-section-use-case.ts`
exports:

- `ContentSectionCapability` — the structural interface every capability satisfies with
  identical arity: `buildInstallPath(fileName): string | null` and
  `serialize(frontmatter, body): string`. The engine calls these two directly on `cap`
  with no per-section branching, because they really are uniform across all four.
- `ContentSectionDescriptor<K extends UserFileSection, Cap extends ContentSectionCapability>`
  — carries only what is *not* uniform: `acceptsFileName(cap, fileName, allToolSuffixes)`
  and `convertFrontmatter(cap, frontmatter, relativeFileName)`. Each of the four
  descriptors (one per wrapper file) adapts its own capability's real arity to this
  common call signature — e.g. the commands/rules/skills descriptors' `acceptsFileName`
  ignores the `allToolSuffixes` argument because those capabilities compute their own
  suffix list; only the agents descriptor forwards it.
- `InstallContentSectionUseCase<K, Cap>` — the single generic engine. `K` is the literal
  section key (`"agents" | "commands" | "rules" | "skills"`, reusing the existing
  `UserFileSection` union from `domain/tools/contracts.ts`), and `Cap` defaults to
  correlate with `K` through `toolConfig.capabilities[key]`: `toolConfig` is typed
  `AiTool<Record<K, Cap>>`, so `toolConfig.capabilities[this.descriptor.key]` resolves to
  `Cap` via generic mapped-type indexed access (`Record<K, Cap>[K]`), not a cast. `Cap`
  itself is bounded by `extends ContentSectionCapability`, which is what lets the engine
  call `cap.buildInstallPath` / `cap.serialize` on a still-generic `Cap` without needing
  a resolved literal type — the standard fix for TypeScript not distributing member
  access over a raw conditional type keyed on a generic parameter.

No `switch (section)` or `if (section === "agents")` branch exists anywhere in the
generic engine; the four differences that are not uniform are pushed entirely into the
four small descriptor objects, one per wrapper file, each typed for its own literal `K`.

## Old classes: kept as thin wrappers, not deleted

`InstallAgentsUseCase`, `InstallCommandsUseCase`, `InstallRulesUseCase`, and
`InstallSkillsUseCase` still exist, each in its own file, each still exposing the exact
constructor (`(hasher: Hasher)`) and `execute(options)` signature (with
`toolConfig: AiTool<HasAgents>` etc.) that callers and tests already depend on. Each is
now ~30 lines: a `ContentSectionDescriptor` literal encoding that section's two
differences, plus a class that builds one `InstallContentSectionUseCase` in its
constructor and delegates `execute` to it.

Kept as wrappers rather than deleted because:

- `generate-tool-distribution-use-case.ts` and all four test files construct these
  classes by name and by import path. Deleting them would force touching call sites and
  test files beyond "constructor/wiring changes," which the task explicitly limits.
- The wrapper is where each section's real behavioral difference (its descriptor) lives,
  in one place, next to the type it's tied to (`AgentsCapability`, `CommandsCapability`,
  etc.) — readable without needing to open the generic engine to see what's different
  about, say, skills.
- No behavior or public surface needed to change to satisfy the ticket, so removing the
  named classes would have been a rename for its own sake, not a simplification.

## Decisions

| Decision | Why |
|---|---|
| Reuse `UserFileSection` from `domain/tools/contracts.ts` as the generic key `K` instead of inventing a new union | It already exists, already spans exactly these four sections, and is already used elsewhere (`UserFileSectionKey`) — no reason to add a parallel type. |
| `ContentSectionCapability` interface for the two uniform methods (`buildInstallPath`, `serialize`) | These two really have identical arity across all four capabilities — no adapter needed, so giving them a real structural interface and bounding `Cap` on it lets the engine call them directly, which is more honest than hiding them behind descriptor functions too. |
| `ContentSectionDescriptor` for the two non-uniform methods (`acceptsFileName`, `convertFrontmatter`) | Their arity genuinely differs per capability (agents needs a tool-suffix list; agents/commands need `relativeFileName`, rules/skills don't). Expressing this as data (one descriptor object per section) satisfies "drive from data, not a switch," and keeps each section's peculiarity localized to its own wrapper file instead of scattered through the engine body. |
| `agents` calls `cap.serialize(...)` — kept as `cap.serialize`, not `serializeFrontmatter` import | This is the one branch (`format === "toml"`) that is a real behavioral difference. Calling `cap.serialize` uniformly for all four sections preserves the toml branch for agents and is a no-op for the other three (verified: their own `serialize` is a pass-through to the same `serializeFrontmatter` the originals imported directly). Not treated as a "difference to preserve via descriptor" because after this check it isn't a difference in observable output — it's the same output via a shorter, more uniform path. |
| `ALL_TOOL_SUFFIXES` computed once in the shared engine file, passed to every `acceptsFileName` call, ignored by three of the four descriptors | Matches original behavior exactly (agents used to compute this locally from `AI_TOOL_IDS`; the value and its source are unchanged) while keeping the "only agents needs this" fact expressed as "this descriptor ignores its third argument" rather than an `if (key === "agents")` inside the engine. |
| `Cap extends ContentSectionCapability = ContentSectionCapabilityFor<K>`-style correlation via `Record<K, Cap>` indexed access, not two independent unconstrained generic parameters | Two independent generics (`K`, `Cap`) with no correlation would let a caller mismatch them (e.g. instantiate with `K = "agents"`, `Cap = CommandsCapability`) and only get caught, if at all, deep in a structural-assignability error far from the mistake. Indexing `toolConfig.capabilities[this.descriptor.key]` off `AiTool<Record<K, Cap>>` means `Cap` is derived from the same `K` that selects the capability at the one call site that matters, so the correlation is structural, not just a naming convention. |
| No `as`/`as unknown as` cast anywhere in the new code | Not needed. The one place a cast might have been reached for (accessing `toolConfig.capabilities[key]` generically) resolved cleanly through `Record<K, Cap>` mapped-type indexed access, which TypeScript supports natively for a type indexed by its own generic key parameter. |

## Verification

1. `npx tsc --noEmit` — no errors, both before and after the mutation test's revert.
2. `pnpm test` from `cli/` — 197 test files passed, 2136 tests passed, 0 failures. Same
   count as the confirmed baseline (`origin/next` before this change: 197 files, 2136
   tests). No existing test file was edited.
3. Biome, one file at a time via `./node_modules/.bin/biome check --write <file>`:
   - `src/application/use-cases/install/install-content-section-use-case.ts` — "Checked 1
     file in 42ms. No fixes applied."
   - `src/application/use-cases/install/install-agents-use-case.ts` — "No fixes applied."
   - `src/application/use-cases/install/install-commands-use-case.ts` — "No fixes applied."
   - `src/application/use-cases/install/install-rules-use-case.ts` — "No fixes applied."
   - `src/application/use-cases/install/install-skills-use-case.ts` — "No fixes applied."
   No OOM retries were needed.
4. Mutation test: in `install-content-section-use-case.ts`, `buildFile` changed
   `relativePath: outputPath` to `relativePath: \`${outputPath}.mutated\`` — a value that
   cannot coincidentally equal any test's expected path. Ran
   `pnpm test tests/application/use-cases/install/`: 4 test files failed, 7 tests failed,
   31 passed. The 4 failing files were exactly the 4 install-section test files, one
   section each:
   - `install-agents-use-case.unit.test.ts` (agents) — 2 failing tests
   - `install-commands-use-case.unit.test.ts` (commands) — 1 failing test
   - `install-rules-use-case.unit.test.ts` (rules) — 2 failing tests
   - `install-skills-use-case.unit.test.ts` (skills) — 2 failing tests
   All four sections broke from one mutation in the shared engine, confirming they share
   the real implementation rather than four independent copies that happen to look
   alike. The mutation was reverted; `npx tsc --noEmit` re-confirmed clean and
   `pnpm test` re-confirmed 197 files / 2136 tests / 0 failures.
5. Read the final code to confirm the two asymmetries the ticket called out by name still
   hold:
   - **Agents' `ALL_TOOL_SUFFIXES` behavior holds.** In
     `install-content-section-use-case.ts`, `ALL_TOOL_SUFFIXES` is computed once from
     `AI_TOOL_IDS` and passed as the third argument to every `descriptor.acceptsFileName`
     call. In `install-agents-use-case.ts`, `agentsDescriptor.acceptsFileName` forwards
     it: `cap.acceptsFileName(fileName, allToolSuffixes)`. The other three descriptors
     (`install-commands-use-case.ts`, `install-rules-use-case.ts`,
     `install-skills-use-case.ts`) receive the same third argument but their
     `acceptsFileName` implementations call `cap.acceptsFileName(fileName)` without it —
     checked by reading each file directly. Fact confirmed.
   - **The per-section `relativeFileName` difference holds.** In
     `install-agents-use-case.ts` and `install-commands-use-case.ts`,
     `convertFrontmatter` calls `cap.convertFrontmatter(frontmatter, relativeFileName)`.
     In `install-rules-use-case.ts` and `install-skills-use-case.ts`,
     `convertFrontmatter` calls `cap.convertFrontmatter(frontmatter)`, dropping
     `relativeFileName` — checked by reading each file directly. Fact confirmed.
