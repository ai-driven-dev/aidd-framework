# Brainstorm: Gemini CLI as a first-class AIDD tool

> Source: [issue #511](https://github.com/ai-driven-dev/framework/issues/511) — the issue's surface mapping is factually wrong and must be rewritten from this document.

## Refined idea

Gemini CLI becomes a full citizen of the tool registry, not just a release archive. It gets the whole lifecycle the other five tools have: flat build, install, sync, restore, doctor, update, and a manifest entry. Marketplace mode stays out of scope — Gemini CLI has no plugin-manager equivalent.

The mapping is native, surface by surface. Nothing is degraded into prose, which was the original assumption and is no longer needed.

| AIDD surface | Gemini CLI target | Notes |
|---|---|---|
| Skills | `.agents/skills/aidd-<skill>/SKILL.md` | Shared tree, already codex's target, official Gemini alias. Discovered at session start, activated via the `activate_skill` tool |
| Agents | `.gemini/agents/*.md` | Frontmatter `name` + `description`, body is the system prompt, invoked with `@name` |
| MCP | `mcpServers` in `.gemini/settings.json` | |
| Hooks | `hooks` object in `.gemini/settings.json` | Gemini lifecycle events: `SessionStart`, `BeforeTool`, `AfterTool`, `BeforeModel`, … |
| Rules / context | `AGENTS.md` | Gemini does not read it by default; the build writes `context.fileName` into `.gemini/settings.json` |
| Commands | — | Out of scope, as for every target. A framework-build limitation, not a Gemini one |

Skill content published under `.agents/skills/` becomes tool-neutral: no reference to any tool directory, so a single tree is valid for codex, for Gemini, and for future consumers of the same location (Antigravity, a later ticket). Accepted consequence: **#511 also changes the codex output** — it is no longer a purely additive ticket.

### Success criterion

A user who has only Gemini CLI unzips the archive into their project. Skills show up at session start and activate. Agents answer to `@`. MCP servers are wired. `AGENTS.md` is loaded as context.

## Verified facts

Checked against the Gemini CLI documentation, against the issue's claims:

- **Skills** — native. `.gemini/skills/` or the `.agents/skills/` alias, `SKILL.md` unchanged. ([docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md))
- **Agents** — native, contrary to the issue's "no known equivalent". `.gemini/agents/*.md`. ([docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md))
- **Hooks** — native, contrary to the issue's "needs investigation". Declared in `settings.json`. ([docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/index.md))
- **Commands** — native (`.gemini/commands/*.toml` → `/git:commit`), but the AIDD build emits commands for no target today.
- **AGENTS.md** — *not* read by default, contrary to the issue. Requires `context.fileName` (string or array). ([docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md))

Repo-side, the shared skills tree already exists: `cli/src/domain/tools/ai/codex.ts` sets `prefix: "aidd-"`, producing `.agents/skills/aidd-<skill>/SKILL.md` (`cli/src/domain/capabilities/skills-capability.ts:5`).

## Open assumptions and risks

1. **Shared ownership is not solved by neutralizing content.** Neutral or not, `aidd ai uninstall codex` deletes `.agents/skills/aidd-*` and Gemini silently loses its skills. The manifest, `restore` and `doctor` need to understand multiple owners for one path. To settle at design time.
2. **Neutralization is bounded but not trivial.** One `SKILL.md` references `.claude/` (`plugins/aidd-orchestrator/skills/00-async-dev/SKILL.md`, 4 occurrences), and roughly 24 reference files under `skills/` mention it too — mostly inside multi-tool tables that must **not** be rewritten. Telling a described path from a real path is sorting work, not a `sed`.
3. **`context.fileName` is a user setting.** Merge strategy to define: never overwrite an existing value, handle a user who already set their own list.
4. **Hook mapping is unverified event by event.** Claude and Gemini do not expose the same hook points. Kept in scope on an explicit "let's try"; to be dropped from the ticket if the mapping does not hold.
5. **Detection ambiguity.** Codex's `detectUserFileSectionKey` already claims the `.agents/skills/aidd-` prefix. Gemini's `signalDir` and the resolution of that ambiguity are undefined.
6. **CI cost is unmeasured.** Sync matrix grows 5×5 → 6×6, plus the golden snapshot matrix.
7. **Minimum Gemini CLI version unverified** for skills, agents and hooks. The archive assumes a recent release.
8. **Assumed, not confirmed:** Gemini must work standalone, without codex installed. Reasonable, since `.agents/` is an official Gemini alias, but it was never explicitly confirmed.
9. **Issue #511 must be rewritten**, not merely completed — its agents, hooks and AGENTS.md claims are wrong.

## Decisions taken during the brainstorm

| Question | Decision |
|---|---|
| Build target only, or full registry citizen? | Full citizen |
| Surfaces without a native equivalent | Moot — every needed surface turned out native |
| Where skills land | `.agents/` shared tree |
| Which form the sharing takes | Tool-neutral skill content (option A), accepting the codex output changes too |
| Context file | Everything in `AGENTS.md`, made readable via `context.fileName` written by the build |
| Hooks | In scope, best effort |
