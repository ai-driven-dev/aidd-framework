---
status: done
---

# Instruction: body metadata detection stops guessing

`hasBodyMetadata` (`check-backlog.js:157`) rejects any body line starting with a
field name followed by a colon, bullets included. `order`, `source` and `status`
are ordinary English words, so legitimate content fails. Verified:
`- source: https://support.example.com/ticket/4821` under `## Evidence`, which is
exactly what `defect-template.md` invites, and
`- order: results are sorted by relevance` under `## Acceptance`.

The rule exists to catch frontmatter recopied into the body. That copy always
sits in the preamble, before the first section, or inside a metadata table.

## Architecture projection

```txt
.
├── plugins/aidd-pm/hooks/check-backlog.js        ✏️ scope the scan to the preamble and metadata tables
└── scripts/__tests__/check-backlog.test.js       ✏️ pin both the catch and the two false positives
```

## Tasks to do

### `1)` Restrict the scan surface

> Only where a copy of the frontmatter can plausibly live.

1. Scan the body up to the first `## ` heading.
2. Keep scanning table rows anywhere, since a metadata table is the other copy shape.
3. Leave `EMBEDDED_FRONTMATTER` untouched: it already catches the `---` block form wherever it sits.

### `2)` Pin the boundary with tests

> The regression to fear is silence, not noise.

1. Assert a preamble `status: ready` line still fails.
2. Assert `- source: <url>` under a section passes.
3. Assert a prose line naming `order:` under a section passes.

## Test acceptance criteria

| Task | Acceptance criteria                                                                    |
| ---- | -------------------------------------------------------------------------------------- |
| 1    | An artifact whose body repeats `status:` before its first section is rejected           |
| 1    | An artifact citing a source or describing ordering inside a section is accepted         |
| 2    | The instantiated Defect and Story templates, filled with real evidence, pass the checker |
