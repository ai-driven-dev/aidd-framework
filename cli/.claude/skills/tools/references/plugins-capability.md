# Reference: PluginsCapability

The params are declared and documented in `contexts/tools/domain/capabilities/plugins-capability.ts`.
Read them there — this page carries only the decisions a field list cannot state, and a copied
list would age at every field.

## Three modes

| Mode | When to use |
|---|---|
| `"native"` | the tool has a first-class plugin directory structure |
| `"flat"` | the tool stores plugins as flat files under a name prefix |
| `"unsupported"` | the tool has no plugin concept |

## translationMode

- `"marketplace"` — register a plugin reference in the tool's native config; nothing is
  materialized on disk.
- `"flat"` — materialize plugin content as flat files (automatic for `mode: "flat"`).
- `null` — neutral native; no translation strategy applies.

The profile only declares the mode. Routing on it at install time is `framework`'s job
(`contexts/framework/application/framework/translator/plugin-translator-factory.ts` — a name that
predates the `translate` context and should not be confused with it). `translate` itself does the
author-side `aidd translate` build, a different pipeline reading the same capability.

## installScope

- `"project"` (the default) — plugins land relative to the project root.
- `"user"` — relative to the user home directory; requires a `userPluginsDir` resolver.

## nativeActivation

Declaring it says the tool writes its own marketplace registration through its own CLI, and the
marketplace sync stands back: `marketplaceSettings` still says *where* the file is, for the
gitignore and for `status`, but no longer *who* writes it. Every verb and argument on it was
measured against the real binary, and the doc comments in the source say what each measurement
found. Do not add one by analogy with another tool.

## MCP namespacing

Every flat MCP merge key-prefixes servers by `<plugin>-`. A tool whose MCP config lives at one
primary location has no isolation otherwise: two plugins declaring a server of the same name
collide. The prefix is mandatory for every tool.
