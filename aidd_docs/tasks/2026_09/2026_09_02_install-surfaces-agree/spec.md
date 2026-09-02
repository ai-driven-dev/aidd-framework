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
| Copilot | `~/.copilot/config.json` | **JSONC** | — | `installedPlugins`, an array |

Shapes, keys only:

```
known_marketplaces.json   { "<name>": { source: {source, repo|path}, installLocation, lastUpdated, autoUpdate? } }
installed_plugins.json    { version, plugins: { "<plugin>@<marketplace>": [ {scope, installPath, version, installedAt, lastUpdated, gitCommitSha} ] } }
config.toml               [marketplaces.<name>] · [plugins."<plugin>@<marketplace>"] enabled = true
config.json               // comments, then { firstLaunchAt, installedPlugins: [], … }
```

**Three findings that shape the design, not decoration:**

1. **Copilot's file is JSONC.** It opens with two `//` comment lines, so `JSON.parse` throws
   on it — verified, `SyntaxError: Unexpected token '/'`. A reader that let that throw fall
   through as "no plugins registered" would print a zero where the honest answer is *unknown*.
   This is the exact failure this layer exists to refuse, waiting in the first file it reads.
2. **`installed_plugins.json` records a `scope`** — `user`, `project`, `local` observed —
   but its `installPath` always points inside the plugins cache, never at a project. So the
   registry says *this machine can load this ref*; only the project's own `enabledPlugins`
   says *this project wants it*. The comparison needs both sides and cannot be done from
   either alone.
3. **The architecture already exists.** `HookTrustReader` +
   `hook-trust-reader-adapter.ts` reads `~/.codex/config.toml` to answer one `check` claim,
   with the three-state error handling this needs. What is built here is its sibling, not a
   new layer.

## Design

**No new command.** `aidd telemetry check` already asks whether the chain will record. This
is one more claim inside it. The surface stays seven.

**A registry is declared per tool, never hardcoded.** The three hosts that declare
`nativeActivation` (`claude.ts:123`, `codex.ts:260`, `copilot.ts:335`) gain an optional
declaration of where their registry lives and how it is read — the same way
`marketplaceSettings` already declares where the settings file lives. A tool that declares
none is reported as *not answerable*, never as agreeing.

**Three answers per declared plugin, never two:**

| Answer | Means |
| --- | --- |
| registered | the registry was read and carries the ref |
| declared, not registered | the registry was read and does not carry it — the #703 failure, naming which of the two files lacks it |
| unknown | the registry could not be read or parsed — absent file, permissions, JSONC |

The third is not a soft version of the second. A file that cannot be parsed and a file that
says "no" are different facts, and printing them alike is the defect this ticket is about.

## Acceptance

- [ ] The host's own registry is read, not only the declaration the CLI wrote.
- [ ] `check` states whether the two agree and names the missing side — never a bare pass.
- [ ] A registry that cannot be read reports as unknown, distinctly from one read and lacking
      the entry. Asserted with a JSONC fixture, because that is a real file, not a hypothetical.
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
