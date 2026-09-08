# Codebase Map

Where things live. The architecture rules carry no paths on purpose, so this is the single place that says — and `tests/architecture/codebase-map.arch.test.ts` holds it to the tree in both directions.

```txt
src/
├── contexts/    # bounded contexts — no barrel, nothing reaches inside another
│   ├── distribution/    # where content comes from and how it is fetched
│   │   ├── application/
│   │   ├── domain/
│   │   │   ├── catalog-parsers/
│   │   │   └── ports/
│   │   └── infrastructure/
│   ├── framework/    # the installation record and everything done to a project
│   │   ├── application/
│   │   │   ├── clean/
│   │   │   ├── doctor/
│   │   │   ├── flows/
│   │   │   ├── framework/
│   │   │   │   └── translator/
│   │   │   ├── global/
│   │   │   ├── install/
│   │   │   │   └── content/
│   │   │   ├── plugin/
│   │   │   ├── restore/
│   │   │   ├── setup/
│   │   │   ├── shared/
│   │   │   └── uninstall/
│   │   ├── domain/
│   │   │   ├── formats/
│   │   │   ├── manifest/
│   │   │   ├── plugins/
│   │   │   └── ports/
│   │   └── infrastructure/
│   ├── telemetry/    # what a session cost and who it was for
│   │   ├── application/
│   │   ├── domain/
│   │   │   ├── formats/
│   │   │   ├── ports/
│   │   │   └── report/
│   │   │       └── axes/
│   │   └── infrastructure/
│   ├── tools/    # what a project targets, and what each target declares
│   │   ├── domain/
│   │   │   ├── capabilities/
│   │   │   ├── formats/
│   │   │   ├── models/
│   │   │   ├── ports/
│   │   │   └── profiles/    # one directory per tool
│   │   │       ├── claude/
│   │   │       ├── codex/
│   │   │       ├── copilot/
│   │   │       ├── cursor/
│   │   │       ├── opencode/
│   │   │       └── vscode/
│   │   └── infrastructure/
│   └── translate/    # canonical source to target-native content
│       ├── application/
│       │   └── strategies/
│       ├── domain/
│       │   └── formats/
│       └── infrastructure/
├── kernel/    # shared vocabulary — imports no context, carries no business logic
│   ├── materialization/    # where content lands and how its links follow
│   ├── ports/    # a port two or more contexts both need
│   └── reading/    # getting at a file's location and its content safely
├── presentation/    # everything that talks to a human — depends on contexts, never the reverse
│   ├── commands/    # one file per command, wiring only
│   ├── display/    # rendering a result
│   └── prompts/    # asking the user; the decision stays in the context
└── runtime/    # technical services that are not a context
    ├── assets/
    ├── auth/
    │   └── ports/
    ├── filesystem/
    ├── git/
    ├── http/
    ├── platform/
    ├── project-root/
    ├── prompter/
    ├── self-update/
    └── wiring/    # one composition module per context, plus the composition root
```

## Areas

- `src/kernel/`: what two or more contexts both speak. No context import, no business logic.
- `src/contexts/`: the five bounded contexts. Nothing reaches inside another; the allowed edges are in `architecture.md`.
- `src/presentation/`: commands, rendering, prompts. Depends on contexts, never the reverse.
- `src/runtime/`: services that are not a context — http, git, auth, assets, filesystem, self-update — and the wiring that composes everything.
- `tests/`: mirrors `src/`, one tier per file extension. `tests/architecture/` holds the ratchets, `tests/golden/` the snapshots, `tests/helpers/ports/` the doubles.
- `assets/`: configs inlined at build time, schemas copied beside the binary.
- `scripts/`: bundle budget, mutation runner, smoke harness.

## Entry points

- `src/cli.ts` → `dist/cli.js`, bin `aidd`.
- `src/runtime/wiring/framework.ts` — the composition root. Start here when wiring anything.

## Where to add things

| What | Where |
| ---- | ----- |
| a command | `presentation/commands/`, plus the use case in whichever context owns the concept |
| a prompt | `presentation/prompts/`; the decision it feeds stays in the context |
| a use case | the context whose concept it serves. There is no landing zone: one that fits nowhere means the contexts are wrong |
| a tool | one profile directory under `contexts/tools/domain/profiles/` |
| a transform shared by two profiles | `contexts/tools/domain/formats/`; used by one, that profile's own directory |
| a port used by one context | that context's `domain/ports/`, adapter in its `infrastructure/` |
| a port used by two | `kernel/ports/`, adapter in `runtime/` |
| a runtime service | `runtime/<service>/`, wired from `runtime/wiring/` |
| a cost-report axis (its own key, sentinels, group shape, order) | `contexts/telemetry/domain/report/axes/`; the pass that fills it stays in `cost-report.ts`, which the axis reaches only through `import type` |
