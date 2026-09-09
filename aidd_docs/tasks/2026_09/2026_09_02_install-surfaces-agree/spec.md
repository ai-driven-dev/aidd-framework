---
status: framed
backlog: ai-driven-dev/framework#703
branch: fix/install-surfaces-agree
base: next@627408fb
---

# The two install surfaces agree, or `check` says which one is missing

## The gap, in one sentence

`aidd telemetry check` can say **the plugin is declared**. It cannot say **the host CLI
registered it, so it will actually load** — and those are different facts, which is the
whole of #703.

## Boundary check — inside, and here is why

This reads a host tool's own configuration files under the person's home directory. Against
`aidd_docs/memory/internal/decisions/measurement-may-reach-a-hosted-destination.md`:

- **Clause 1** — *"The shipped route reads the files each AI tool already wrote."* A plugin
  registry is one such file. The transcripts already read under `~/.claude/projects/` are the
  same act with a heavier payload.
- **Clause 5** — what is read is on the person's own machine, from their own profile, by
  them. Nothing leaves it, and no account is involved.
- **The "it stops growing" consequence applies to report axes**, not to diagnosis. This adds
  no eighth axis: `check` answers whether the chain will record, and this is one more claim
  inside that question, not an aggregation.

Inside the boundary. Nothing here needs a destination, a network or an account.

## What was measured, 2026-09-02, on the machine that built this

Read to learn shape only. No value from any of these files enters a fixture.

**All three hosts key their registry on the same string** the CLI already writes into
`enabledPlugins` — `<plugin>@<marketplace>`. That is the join, and it is uniform:

| Host | File | Format | Marketplaces | Plugins |
| --- | --- | --- | --- | --- |
| Claude Code | `~/.claude/plugins/known_marketplaces.json`, `installed_plugins.json` | JSON | object keyed by name | `plugins`, keyed by `<plugin>@<marketplace>` |
| Codex | `~/.codex/config.toml` | TOML | `[marketplaces.<name>]` | `[plugins."<plugin>@<marketplace>"]`, with `enabled` |
| Copilot | `~/.copilot/settings.json` | JSON | `extraKnownMarketplaces` | `enabledPlugins`, `<plugin>@<marketplace>` to a boolean |

Shapes, keys only:

```
known_marketplaces.json   { "<name>": { source: {source, repo|path}, installLocation, lastUpdated, autoUpdate? } }
installed_plugins.json    { version, plugins: { "<plugin>@<marketplace>": [ {scope, installPath, version, installedAt, lastUpdated, gitCommitSha} ] } }
config.toml               [marketplaces.<name>] · [plugins."<plugin>@<marketplace>"] enabled = true
config.json               // comments, then { firstLaunchAt, installedPlugins: [], … }
```

**Three findings that shape the design, not decoration:**

1. **The file that looks like Copilot's registry is not it.** `~/.copilot/config.json` is
   JSONC — it opens with two `//` comment lines, so `JSON.parse` throws, verified — and its
   `installedPlugins` reads empty on a machine that has run installs. Both facts are true and
   neither matters: driven live on 2026-09-03 against Copilot CLI 1.0.82 under a sandboxed
   home, `plugin marketplace add` and `plugin install` write `~/.copilot/settings.json`.
   `uninstall` sets the ref to `false` rather than deleting it, so registered-but-off is an
   ordinary state there. The JSONC hazard stands on its own: a registry that parses as
   nothing must read as *unknown*, never as "carries none".
2. **`installed_plugins.json` binds a ref to a project.** Its `installPath` always points
   inside the plugins cache — but that is not the whole entry. Read across all 115 entries
   rather than the first one, they carry `projectPath` on 100 of them, exactly the 99 at
   `scope: "project"` plus the one at `"local"`; the 15 user-scoped entries carry none,
   because they apply everywhere. So the registry does say which project wants a ref, and
   `aidd` writes every one at project scope (`claude-cli-adapter.ts`'s `PROJECT_SCOPE_ARGS`).
   A reader that ignored it would report a plugin installed for another project as one this
   host will load here.
3. **Codex records `enabled`, and it is the only key it records.** Every plugin table on the
   machine measured carries `enabled = true` and nothing else. So `enabled = false` is
   possible and unobserved — a state where the host knows the plugin and will still not load
   it, which is not the same fact as an absent entry. The count is deliberately not stated: it
   moves with what happens to be installed, so it can carry no argument.
4. **The architecture already exists.** `HookTrustReader` +
   `hook-trust-reader-adapter.ts` reads `~/.codex/config.toml` to answer one `check` claim,
   with the error handling this needs. What is built here is its sibling, not a new layer —
   and it inherits that adapter's stated choice to **line-scan** `config.toml` rather than
   parse it: *"carries arbitrary nested tables and multi-line values this adapter has no
   business understanding"*. Concretely, the file measured is 26 KB and most of it is
   `[projects."<absolute path>"]` tables; parsing the whole document to read `[plugins.…]`
   would pull every project path on the machine into a process that then writes diagnostic
   output. Line-scanning reads the one shape Codex always emits verbatim and nothing else.

## Design

**No new command.** `aidd telemetry check` already asks whether the chain will record. This
is one more claim inside it. The surface stays seven.

**A registry is declared per tool, never hardcoded.** The three hosts that declare
`nativeActivation` (`claude.ts:123`, `codex.ts:260`, `copilot.ts:335`) gain an optional
declaration of where their registry lives and how it is read — the same way
`marketplaceSettings` already declares where the settings file lives. A tool that declares
none is reported as *not answerable*, never as agreeing.

**The declaration side is AIDD's own manifest, not `enabledPlugins`.** This is the
correction that changes what the code compares. `mergeEnabledPlugins`
(`marketplace-sync-settings-use-case.ts:413-417`) iterates `manifest.getPlugins(toolId)` and
**skips silently, twice**: once when a plugin records no marketplace, once when its
marketplace does not resolve. A plugin AIDD installed under either condition never reaches
`enabledPlugins` at all — so comparing `enabledPlugins` against the registry would find both
sides absent and call it agreement, while the plugin is installed and will never load. The
manifest is what that loop reads *from*, and it carries `name` and an optional `marketplace`
(`domain/models/plugin.ts:36`), which is exactly the `<plugin>@<marketplace>` ref.

So there are **three surfaces, two hops**:

```
AIDD manifest  ──►  the project's enabledPlugins  ──►  the host's own registry
   what AIDD           what the project                what the host will
   installed            declares                       actually load
```

**Four answers per installed plugin, never fewer:**

| Answer | Means |
| --- | --- |
| registered | the registry was read and carries the ref |
| registered-disabled | the registry carries it and records it off — Codex's `enabled = false` |
| not-registered | the registry was read and lacks it, naming which file — the #703 failure |
| unanswerable | the ref cannot be built (no marketplace recorded), or no registry could be read |

`unanswerable` is not a soft version of `not-registered`. A file that cannot be parsed and a
file that says "no" are different facts, and printing them alike is the defect this ticket is
about. `registered-disabled` earns its own row for the same reason: folding it into
`registered` would report a plugin that will not load as one that will. And `unanswerable`
itself carries two distinct sentences, because they send a person to different places: a tool
that declares no native activation has no registry to look for, while a tool that declares
one and has no reader here has a registry nobody has measured.

**A fifth answer was designed and is not built.** Telling "the host does not carry it" from
"it never reached the project's `enabledPlugins` at all" needs the set of declared refs per
tool, and `TelemetryEvidenceReader` exposes no accessor for it — `readRecorderDeclaration`
looks for the recorder specifically, not every declared key. That is a port method, an
adapter method and their tests, for a distinction between two flavours of one outcome: the
plugin will not load. The comparison starts from the manifest, which is the half that made
the distinction visible and the half that matters; the second hop is named in #703's thread
rather than half-built.

## Acceptance

- [ ] The host's own registry is read, not only the declaration the CLI wrote.
- [ ] `check` states whether the two agree and names the missing side — never a bare pass.
- [ ] A registry that cannot be read reports as unanswerable, distinctly from one read and
      lacking the entry. Asserted with a JSONC fixture — written from the shape recorded above,
      never copied from the real file, which carries hashed experiment keys and machine paths.
- [ ] A manifest that cannot be parsed is reported, never fatal: `check` is the command a
      person runs when something is already wrong.
- [ ] The comparison starts from AIDD's own manifest, so a plugin the sync skipped is visible
      rather than reading as agreement between two absences.
- [ ] Codex's `config.toml` is line-scanned, not parsed, and the doc comment says why against
      `hook-trust-reader-adapter.ts`'s own stated reason.
- [ ] A test fails when the two surfaces disagree, driven **through**
      `marketplace-sync-settings-use-case.ts` — which has no test file today.
- [ ] The whole comparison runs with no AI session, no network, no money, no binary on PATH.
- [ ] No tool is hardcoded: Codex and Copilot are answered by their own declaration or
      reported unanswerable, never assumed.
- [ ] If the check output shape changes, every consumer is updated in the same commit,
      `plugins/aidd-telemetry/skills/02-check/` included.

## Out of scope

- Fixing an installation the comparison finds broken. Naming it is this ticket; the
  activation itself already works and shipped in #706.
- #703's third box, which moved to #694 — with no run file there is no session to tell from
  another, so only the diagnostic can answer it.
