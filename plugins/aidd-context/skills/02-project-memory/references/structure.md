# Structure

The tree write scaffolds. Which template fills which file is `memory-destinations.md`; this is the
shape around them, and who owns each part.

```txt
aidd_docs/
├── README.md          copied as is
├── GUIDELINES.md      the team fills its placeholders
├── CONTRIBUTING.md    the team fills its placeholders
└── memory/
    ├── README.md      copied as is, its file list refreshed by the hook
    ├── <bank>.md      the AI writes these, flat, never nested
    ├── internal/      a .gitkeep, internal notes read on demand
    └── external/      a .gitkeep, external notes read on demand
```

- The three root docs are the team's. Their placeholders survive until a human answers them.
- Everything under `memory/` is the AI's, and sits at its root.
- `internal/` and `external/` exist even when empty.
