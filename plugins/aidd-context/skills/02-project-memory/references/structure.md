# Structure

The tree write scaffolds. The memory files are the AI's to write; the three docs at the root are the
team's to fill, and their placeholders survive until a human answers them.

```txt
aidd_docs/
├── README.md          from assets/README.md, copied as is
├── GUIDELINES.md      from assets/GUIDELINES.md, the team fills its placeholders
├── CONTRIBUTING.md    from assets/CONTRIBUTING.md, the team fills its placeholders
└── memory/
    ├── README.md      from assets/templates/memory/README.md, copied as is
    ├── <bank>.md      the memory files, flat (see memory-destinations.md)
    ├── internal/      a .gitkeep, internal notes read on demand
    └── external/      a .gitkeep, external notes read on demand
```
