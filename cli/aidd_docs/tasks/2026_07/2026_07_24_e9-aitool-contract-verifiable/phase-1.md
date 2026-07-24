---
status: done
---

# Instruction: Registry conformance test

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/tests/domain/tools/
    └── registry-conformance.unit.test.ts   ✅ create
```

Zero production change — the whole deliverable is the safety net.

## Tasks to do

### `1)` Assert every registered AI tool satisfies the `AiTool<C>` shape

> Iterate `getAllRegisteredTools()`, not a hardcoded list — that is the point.

1. For each registered tool where `isAiTool(config)`: assert `kind === "ai"`, `toolId` is in `AI_TOOL_IDS`, `directory` is a non-empty string ending in `/`, `toolSuffix` is a non-empty string starting with `.`, `signalDir` is `string | null`, `capabilities` is a non-null object, and `rewriteContent` / `reverseRewriteContent` / `detectUserFileSectionKey` are all functions.
2. Each assertion message must name the offending tool id and field — a bare `expect(x).toBe(true)` failure is useless to whoever adds tool #6. Use per-tool `it()` blocks (`it.each` over the registry) so the failing test's *name* carries the tool id.

### `2)` Assert registry ↔ `AI_TOOL_IDS` agree in both directions

1. Every `AI_TOOL_IDS` entry resolves via `getToolConfig()` and is an AI tool.
2. Every registered AI tool's id is in `AI_TOOL_IDS` — catches a tool registered but missing from the closed union.

### `3)` Assert every registered AI tool is reachable by `framework build`

1. Every registered AI tool id appears at least once in `FRAMEWORK_BUILD_TARGET_MODES` (verified true today for all 5).
2. Reverse: every `FRAMEWORK_BUILD_TARGET_MODES` target is a registered AI tool — catches a stale build entry for a removed tool.

### `4)` Assert the probe tables have no orphan formats, and plugin-capable tools are ingestible

> Precision matters — see plan.md. Probing the live registry found opencode has a marketplace probe but no manifest probe (flat plugin mode, no per-plugin manifest dirs). Do **not** assert manifest-probe coverage per tool.

1. Every `format` in `PLUGIN_MANIFEST_PROBES` and in `MARKETPLACE_PROBES` is a registered AI tool id — catches stale/typo'd entries. (Holds today.)
2. Every registered AI tool declaring a `plugins` capability appears in `MARKETPLACE_PROBES` — the "a new plugin-capable tool can't be silently unreadable" guard. (Holds today for all 5.)
3. Do not assert the `PLUGIN_MANIFEST_PROBES` direction per tool — it is legitimately not universal.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1-4  | All 5 existing tools pass with zero modification to any `ai/<tool>.ts`. |
| 1    | A malformed tool fails with a message naming the tool and the field — verified by temporarily registering a broken tool locally during development, not shipped as a permanent fixture (registering a fake tool into the shared module-level registry map would leak into other test files in the same process). |
| 2-4  | Removing a tool from `AI_TOOL_IDS`, from `FRAMEWORK_BUILD_TARGET_MODES`, or from `MARKETPLACE_PROBES` while leaving it registered makes this suite fail — verified by hand during development. |
| all  | `tsc --noEmit` clean, full suite green, zero production files changed. |
