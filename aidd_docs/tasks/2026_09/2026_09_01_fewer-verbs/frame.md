# Fewer verbs

## The ask

Two chantiers were left on the simplification list: reduce `aidd telemetry identity` from
seven subcommands, and move `aidd_docs/runs` under `.aidd/`. Both were selected explicitly.

## The fact that prices both

Neither has ever been released.

```
$ git ls-tree -d --name-only origin/main plugins/
aidd-context  aidd-dev  aidd-orchestrator  aidd-pm  aidd-refine  aidd-ui  aidd-vcs
                                                    ← no aidd-telemetry

$ git ls-tree --name-only origin/main cli/src/application/commands/ | grep telem
                                                    ← nothing

$ for c in 25f71e47 f53ede96; do git tag --contains $c | grep -vc '^backup/'; done
0
0
```

The whole telemetry layer is absent from `main`, and no release tag (`v5.6.0` … `v5.9.0`)
contains the commits that introduced either the journal directory or the identity command.
So neither carries a migration, a compatibility path, or a person whose script breaks. What
would otherwise be a breaking change is a rename before anyone has seen it.

**This also corrects something shipped an hour ago.** The runtime notice added with
`AIDD_TELEMETRY_DIR` justified itself by naming "the people who followed the plugin README
when it said to share `AIDD_USER_CONFIG_DIR`". That README has never been released either, so
outside this branch that population is empty — the same shape as the `person-mapping.json`
mechanism deleted earlier the same day, reintroduced by the same hand. The notice is kept,
because its real audience is larger and outlives the split: anyone who sets
`AIDD_USER_CONFIG_DIR` for the reason it has always existed (relocating a machine's aidd
config, which a CI job legitimately does) moves their figures beside their token without
intending to. The justification is corrected in place rather than the feature removed.

## Chantier A — the identity surface: seven verbs to four

Today: `status`, `on`, `use <id>`, `off`, `name <value>`, `link <id>`, `unlink <id>`.

Three of those answer one question — *which identifier am I* — through three doors:

| verb | what it does | read from |
| --- | --- | --- |
| `on` | mint one if none stands, else report the standing one back | `person-identity-use-case.ts:100` |
| `use <id>` | adopt an identifier minted elsewhere | `:109` |
| `name <v>` | attach a display name to whichever stands | `:159` |

`use` with no identifier is exactly what `on` does, and a display name is a property of the
identifier, not a separate act. So:

```
aidd telemetry identity                      shows what stands
aidd telemetry identity use [id] [--name x]  mint, adopt, rename — one door
aidd telemetry identity off                  withdraw
aidd telemetry identity link|unlink <id>     this identifier is also me
```

Seven to four, same capability. The bare noun printing state rather than help is the other
half: `aidd telemetry identity` is a question, and answering it with a help screen is a
command surface talking about itself.

`origin: "minted" | "adopted"` must survive the merge — it is the difference between an
identifier this machine created and one a person carried here, and no caller may have to
guess which. `use` with no argument mints; with one, adopts.

## Chantier B — moving the journal: argued down

The case for moving `aidd_docs/runs/` to `.aidd/runs/` was mine: `.aidd/` is what the machine
writes, `aidd_docs/` is what humans author, and a gitignored journal sits on the wrong side.
Verified against the repository, it does not earn itself:

- **It reduces nothing.** The ask was fewer files at a person's scope. Moving a directory
  changes zero counts. The `.gitignore` exceptions (`!.gitkeep`, `!README.md`) would be
  recreated identically at the new path.
- **`aidd_docs/runs/README.md` is a privacy disclosure**, not an implementation note: it is
  where a person reads what is recorded about them, in the directory the records land in.
  `.aidd/` is aidd's own state, entirely git-ignored but for one file, and not somewhere a
  person is invited to look. Burying that document is a real loss against a conceptual gain.
- **The placement is already recorded by the placement authority.** `docs/ARCHITECTURE.md:74`
  names `aidd_docs/runs/<run_id>__<vendor_id>.jsonl` deliberately, and `CLAUDE.md` makes that
  file the authority for where responsibility belongs.

Recorded here rather than silently dropped. I proposed this move; the evidence says I was
wrong to.

## Acceptance

- One door for "which identifier am I": mint, adopt and rename reachable without choosing
  between three verbs.
- `origin` still tells minted from adopted, and no output guesses it.
- The bare `identity` answers with state; nothing requires a person to know a subcommand to
  see what stands.
- Every removed verb's behaviour is still reachable, and a test proves each path.
- No file at a person's scope changes shape: this is a command surface change only.
