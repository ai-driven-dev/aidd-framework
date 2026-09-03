# CLI

The `aidd` binary, built from `cli/` and published to npm as `@ai-driven-dev/cli`.

> `cli/` carries its own `CLAUDE.md` and memory bank. Command detail, interface and internals: [`cli/aidd_docs/memory/cli.md`](../../cli/aidd_docs/memory/cli.md).

## Commands

| Group | Does |
| --- | --- |
| `setup`, `ai`, `ide` | install and refresh AI tool configurations in a target project |
| `plugin`, `marketplace` | add, list, search, update, remove plugins and their marketplaces |
| `framework build` | build a target-native distribution of this repo. CI calls it at a pinned version |
| `kanban` | render `aidd_docs/` task frontmatter as a board |
| `auth`, `status`, `doctor`, `clean`, `restore`, `update`, `self-update` | credentials, diagnosis, upkeep |

## Interface

- Node `>=22.12`, ESM, Commander. Ink and React for the interactive views.
- `kanban/` is bundled from source at build time, so its deps must resolve before any `cli` job.

## Distribution

npm, through OIDC trusted publishing, no token. `publish-cli` runs when release-please releases the `cli` path.
