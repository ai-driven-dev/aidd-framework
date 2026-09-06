---
status: done
---

# A smoke case checks what it broke

## The defect

Four cases in `smoke-tools.sh` damaged a file and then proved nothing about it.

**They did not know which file they damaged.** Four places picked one with
`find … | head -1`. `find` answers in directory order — not sorted, and not the same on two
filesystems — so each run corrupted whichever file happened to come back first. A case that
cannot name the file it broke is a case nobody can debug, and four of them shared the
pattern:

```sh
cache_catalog() { find "$1/.aidd/cache/marketplaces" -path "*marketplace.json" … | head -1; }
tgt=$(find "$BASE/.claude" -name "*.md" | head -1)
d=$(find "$BASE/.cursor" -name "*.md" 2>/dev/null | head -1)
i=$(find "$BASE/.vscode" -type f | head -1)
```

**And the three restore cases never checked the repair.** Each appended drift, ran
`restore --force`, and asserted exit `0`:

```sh
if [[ -n "$tgt" ]]; then printf '\nDRIFT\n' >> "$tgt"; fi
run "restore --force" 0 "" "$BASE" -- restore --force
```

A `restore --force` that exits 0 having restored nothing is precisely the failure #762 fixed
inside the command. The smoke case meant to cover it would have passed throughout.

The `ide` case was worse still: its drift was a bare newline, which `grep` cannot see, so no
check on that file was possible at all.

## The change

- `first_file` replaces every `head -1`: `LC_ALL=C sort | head -1`, so the same file is
  chosen on every machine and every run.
- One named marker, `SMOKE_DRIFT`, is what the three cases append — a mark a check can look
  for, unlike a blank line.
- `repaired "<case>" "<file>"` runs after each restore and fails when the mark is still
  there, or when nothing was drifted to repair in the first place.

## Guards

The harness is not run by CI (`pnpm smoke` is manual), so the guards read its text, the way
`smoke-harness-isolation.unit.test.ts` already guards the home sandbox.

| Guard | Mutation that killed it |
| --- | --- |
| no `find … \| head` survives anywhere in the harness | put one back — 1 |
| every `restore --force` case is followed by a `repaired` check | drop one of the three — 1 |
| the drift carries a name a check can grep for | rename the mark to `X` — 1 |

Each was written first and failed for the reason it names. `bash -n` and
`shellcheck -S error` both clean.
