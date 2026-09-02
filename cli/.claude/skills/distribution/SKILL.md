---
name: distribution
description: >
  Owns where plugin and marketplace content comes from and how it is fetched, under
  src/contexts/distribution/ — marketplace registration, catalog parsing, and the ports/adapters
  that reach git and HTTP. Use when adding a new marketplace source kind, a catalog parser for a
  foreign format, or a fetch/cache/trust-store adapter. Do NOT use for what a tool does with
  fetched content — use `tools` or `translate`. Do NOT use for recording what got installed on a
  project — use `framework`.
---

# Distribution

`distribution` is a leaf: it depends on `kernel` only, and knows no tool and no manifest. It
answers exactly one question — where does content come from, and how is it fetched — for
whoever asks. `framework` is the only context that reaches it (`framework → distribution`); a
plugin's own content and how it gets translated are someone else's job once it has arrived here.

## What goes in

| Concept | Location |
|---|---|
| A marketplace registration (name, source, scope, staleness) | `domain/marketplace.ts`, `domain/marketplace-source-mode.ts` |
| A cached catalog fetch | `domain/marketplace-cache-entry.ts` |
| The plugin catalog shape | `domain/catalog.ts` (the Claude-shaped parser lives here too) |
| A reader for a non-Claude catalog shape | `domain/catalog-parsers/` |
| A port this context's callers hold | `domain/ports/` — registry, cache, trust-store, catalog-repository, fetcher, raw-catalog-fetcher |
| Add / list / refresh / register / resolve / fetch a marketplace source | `application/` |
| The concrete adapter behind one of the six ports | `infrastructure/` |

## How

- This context is a leaf by construction: it must never gain an edge to `tools`, `translate`, or
  `framework` — `tests/architecture/context-graph.arch.test.ts` enforces the chain
  (`framework → distribution`, plus everything to `kernel`) and fails the build the moment a new
  edge appears. If a change seems to need one, the orchestration belongs to the caller
  (`framework`), not here — see that test's own baseline comment for the one documented
  exception (`marketplace add --overwrite` removing before adding), which is framework work that
  has not yet been moved out.
- A port here follows `.claude/rules/00-architecture/0-ports-adapters.md`: interface only, ≤5
  methods, no `null` in the return type unless "not found" is genuinely a normal domain state
  (documented per-port, not assumed).
- An adapter owns every technical constant for its integration (API base URLs, cache TTLs,
  error-pattern regexes for classifying a third-party failure) — none of that belongs in a port,
  a use-case, or a domain model. `try/catch` inside an adapter exists only to translate a raw
  error into a typed one from `kernel/errors.ts`.
- A new foreign catalog shape gets its own parser in `domain/catalog-parsers/`, producing the
  same `PluginCatalog`/`PluginCatalogEntry` shape the Claude parser produces — callers above this
  context never branch on which format a catalog came from.
- Follow `.claude/rules/00-architecture/0-use-case.md` for the application layer's shape.

## Public surface

Nothing outside `contexts/distribution/` may import a module this context has not declared
public — `tests/architecture/context-boundary.arch.test.ts` holds the list
(`PUBLIC_MODULES.distribution`). Measured at extraction, ten modules were reached from outside
and not one was an adapter: the adapters are wired by the composition root
(`runtime/wiring/distribution.ts`) alone, and stay internal for that reason. A module that
exposes its own plumbing to a caller outside the composition root is not a leaf context anymore
— keep new adapters unreachable from outside.

## How it's tested

- `tests/contexts/distribution/` mirrors `src/contexts/distribution/` — domain models and
  application use-cases are unit-tier; adapters against a real temp filesystem or a mocked
  network boundary are integration-tier. See the `test` skill for tier conventions.
- A new catalog parser needs a fixture of the real foreign format and a test asserting the parsed
  `PluginCatalog` matches what the Claude-shaped parser would produce for an equivalent catalog.
