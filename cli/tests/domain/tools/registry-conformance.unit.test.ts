import { describe, expect, it } from "vitest";
// Side-effect imports: registering every shipped tool is what makes this suite meaningful.
// A tool missing here would silently escape conformance, so the list must stay complete.
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import { FRAMEWORK_BUILD_TARGET_MODES } from "../../../src/domain/models/framework-build.js";
import {
  MARKETPLACE_PROBES,
  PLUGIN_MANIFEST_PROBES,
} from "../../../src/domain/models/plugin-format.js";
import { AI_TOOL_IDS } from "../../../src/domain/models/tool-ids.js";
import type { AiTool } from "../../../src/domain/tools/contracts.js";
import { hasRules } from "../../../src/domain/tools/contracts.js";
import {
  getAllRegisteredTools,
  getToolConfig,
  isAiTool,
  journalHostToAiToolId,
} from "../../../src/domain/tools/registry.js";
import { journalHost } from "../../helpers/telemetry-journal-hook.js";

/**
 * Conformance suite for the AiTool contract.
 *
 * Every assertion iterates the registry rather than a hardcoded list, so adding a tool file
 * automatically subjects it to all of them: omitting that tool from a parallel list elsewhere
 * fails a test instead of misbehaving at runtime.
 *
 * The probe tables (plugin-format.ts) and the build registry (deps.ts) keep their own literal
 * entries — "a format aidd can read" and "a tool aidd installs into" are distinct concepts
 * that happen to share members. These assertions check the two agree, not that one derives
 * from the other.
 */

const registeredAiTools: [string, AiTool<unknown>][] = [
  ...getAllRegisteredTools().entries(),
].flatMap(([id, config]) =>
  isAiTool(config) ? [[id as string, config] as [string, AiTool<unknown>]] : []
);

describe("AiTool contract conformance", () => {
  it("the registry actually contains tools (guards against a no-op suite)", () => {
    expect(registeredAiTools.length).toBeGreaterThan(0);
  });

  describe.each(registeredAiTools)("%s", (toolId, tool) => {
    it("has a well-formed AiTool shape", () => {
      expect(tool.kind, `${toolId}: kind must be "ai"`).toBe("ai");
      expect(tool.toolId, `${toolId}: toolId must match its registry key`).toBe(toolId);
      expect(
        typeof tool.directory === "string" && tool.directory.length > 0,
        `${toolId}: directory must be a non-empty string`
      ).toBe(true);
      expect(tool.directory.endsWith("/"), `${toolId}: directory must end with "/"`).toBe(true);
      expect(
        typeof tool.toolSuffix === "string" && tool.toolSuffix.startsWith("."),
        `${toolId}: toolSuffix must be a string starting with "."`
      ).toBe(true);
      expect(
        tool.signalDir === null || typeof tool.signalDir === "string",
        `${toolId}: signalDir must be a string or null`
      ).toBe(true);
      expect(
        typeof tool.capabilities === "object" && tool.capabilities !== null,
        `${toolId}: capabilities must be an object`
      ).toBe(true);
    });

    it("implements every required content method", () => {
      for (const method of [
        "rewriteContent",
        "reverseRewriteContent",
        "detectUserFileSectionKey",
      ] as const) {
        expect(typeof tool[method], `${toolId}: ${method} must be a function`).toBe("function");
      }
    });

    it("is declared in AI_TOOL_IDS", () => {
      expect(
        (AI_TOOL_IDS as readonly string[]).includes(toolId),
        `${toolId} is registered but missing from AI_TOOL_IDS (domain/models/tool-ids.ts)`
      ).toBe(true);
    });

    it("is reachable by at least one framework build target/mode", () => {
      expect(
        FRAMEWORK_BUILD_TARGET_MODES.some((entry) => entry.target === toolId),
        `${toolId} is registered but has no entry in FRAMEWORK_BUILD_TARGET_MODES (domain/models/framework-build.ts) — 'aidd framework build --target ${toolId}' would be rejected`
      ).toBe(true);
    });

    it("is ingestible when it declares a plugins capability", () => {
      const declaresPlugins = "plugins" in (tool.capabilities as object);
      if (!declaresPlugins) return;
      expect(
        MARKETPLACE_PROBES.some((probe) => probe.format === toolId),
        `${toolId} declares a plugins capability but has no MARKETPLACE_PROBES entry (domain/models/plugin-format.ts) — its native marketplace would never be detected`
      ).toBe(true);
    });

    // #703: a tool that declares `marketplaceSettings` writes a project-local
    // extraKnownMarketplaces/enabledPlugins declaration — that alone was proven, for
    // Claude, to load nothing under `claude -p` (nor even interactively): the runtime
    // reads its own user-global registry, not the project file. `nativeActivation`
    // is what drives that registry via the tool's own CLI. Its absence here is exactly
    // the two-install-surfaces disagreement #703 measured: settings.json says a plugin
    // is enabled, the runtime that actually loads plugins was never told.
    it("drives native CLI activation when its plugins capability declares marketplaceSettings", () => {
      const caps = tool.capabilities as {
        plugins?: { marketplaceSettings?: unknown; nativeActivation?: unknown };
      };
      if (caps.plugins?.marketplaceSettings == null) return;
      expect(
        caps.plugins.nativeActivation,
        `${toolId} declares marketplaceSettings without nativeActivation — its settings.json declaration is never registered with the runtime that resolves plugins`
      ).not.toBeNull();
    });

    // Same shape guard for local-read: the type system requires `telemetryLocalRead` to
    // exist, but not that its `kind` is one of the three this union defines.
    it("declares its local-read shape as declared, unmeasured, or explicitly unsupported", () => {
      expect(
        ["declared", "unmeasured", "unsupported"],
        `${toolId} declares an unrecognized telemetryLocalRead kind: ${tool.telemetryLocalRead.kind}`
      ).toContain(tool.telemetryLocalRead.kind);
      if (tool.telemetryLocalRead.kind === "unsupported") {
        expect(
          tool.telemetryLocalRead.reason.length,
          `${toolId}: telemetryLocalRead.reason must not be empty`
        ).toBeGreaterThan(0);
      }
    });
  });
});

// Cursor's local-read reason is a measured fact (see spec.md non-goals), not a guess.
// Claude and Codex are declared as of phase 2: read via TranscriptCostReaderAdapter, see
// claude-code-transcript.ts and codex-rollout.ts for their measurements. OpenCode is
// declared as of phase 3: read via OpencodeCostReaderAdapter. Copilot is declared as of
// #697: read via TranscriptCostReaderAdapter and copilot-events.ts, at session rather than
// request granularity - see copilot-events.unit.test.ts for the measurement.
describe("telemetryLocalRead — exact declarations, phase 2 of local-cost-read", () => {
  const EXPECTED: Record<
    string,
    { kind: "declared" | "unmeasured" | "unsupported"; reason?: string }
  > = {
    claude: { kind: "declared" },
    codex: { kind: "declared" },
    opencode: { kind: "declared" },
    copilot: { kind: "declared" },
    cursor: { kind: "unsupported", reason: "token count" },
  };

  it.each(Object.entries(EXPECTED))("%s", (toolId, expected) => {
    const tool = registeredAiTools.find(([id]) => id === toolId)?.[1];
    if (!tool) throw new Error(`${toolId} is not registered`);

    const shape = tool.telemetryLocalRead;
    expect(shape.kind).toBe(expected.kind);
    if (shape.kind === "unsupported" && expected.reason) {
      expect(shape.reason).toContain(expected.reason);
    }
  });

  it("covers exactly the five registered AI tools — no tool escapes this check", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(registeredAiTools.map(([id]) => id).sort());
  });
});

describe("no parallel list references an unregistered tool", () => {
  it("every AI_TOOL_IDS entry resolves to a registered AI tool", () => {
    for (const id of AI_TOOL_IDS) {
      const config = getToolConfig(id);
      expect(isAiTool(config), `AI_TOOL_IDS lists "${id}" but its config is not an AI tool`).toBe(
        true
      );
    }
  });

  it("every FRAMEWORK_BUILD_TARGET_MODES target is a registered AI tool", () => {
    const registered = new Set(registeredAiTools.map(([id]) => id));
    for (const { target } of FRAMEWORK_BUILD_TARGET_MODES) {
      expect(
        registered.has(target),
        `FRAMEWORK_BUILD_TARGET_MODES has an entry for "${target}", which is not a registered AI tool (stale entry?)`
      ).toBe(true);
    }
  });

  it("every probe-table format is a registered AI tool", () => {
    const registered = new Set(registeredAiTools.map(([id]) => id));
    for (const [label, probes] of [
      ["PLUGIN_MANIFEST_PROBES", PLUGIN_MANIFEST_PROBES],
      ["MARKETPLACE_PROBES", MARKETPLACE_PROBES],
    ] as const) {
      for (const probe of probes) {
        expect(
          registered.has(probe.format),
          `${label} has an entry for format "${probe.format}" (${probe.relativePath}), which is not a registered AI tool (stale entry?)`
        ).toBe(true);
      }
    }
  });

  it("every host the journal hook writes for is claimed by exactly one tool declaration", () => {
    // The hook spells Claude Code "claude-code" while its toolId is "claude", so a report
    // joining a journal line to a stored record has to relate the two. It relates them by
    // reading these declarations, which is only safe while every host has one — a fifth
    // host added to the hook and not declared here would join to nothing, silently.
    for (const host of journalHost.DECLARED_HOSTS) {
      expect(
        journalHostToAiToolId(host),
        `the journal hook writes for host "${host}", which no registered AI tool declares as its telemetryJournalHost`
      ).not.toBeNull();
    }
  });

  it("declares no journal host the hook does not write for", () => {
    for (const [toolId, config] of registeredAiTools) {
      const declared = config.telemetryJournalHost;
      if (declared === undefined) continue;
      expect(
        journalHost.DECLARED_HOSTS.has(declared),
        `"${toolId}" declares telemetryJournalHost "${declared}", which the journal hook never writes`
      ).toBe(true);
    }
  });

  it("resolves an unknown host to null rather than to a nearby tool", () => {
    expect(journalHostToAiToolId("not-a-host")).toBeNull();
  });

  it("declares task attributability exactly where journal attribution is possible at all", () => {
    // A task no longer needs a written-path extractor: it can be declared instead, read off
    // any tool call's own arguments the way `declaredTaskPath` reads it - free text, scanned
    // for a task-folder path - with no per-host gate the way `WRITTEN_PATH_EXTRACTOR_BY_HOST`
    // gates a written path, or `stepStart` gates a step. That is why this assertion collapses
    // to `telemetryTaskAttributable === (telemetryJournalHost !== undefined)`: once a host's
    // events reach the journal hook *at all*, `handleTaskDeclared` runs unconditionally on
    // every one of them, task declaration included. It does not, on its own, pin OpenCode's
    // own dispatch mechanism (`hooks/opencode-plugin.js`, an ESM file this suite does not
    // import) - that fact is exercised live in `scripts/__tests__/aidd-telemetry-opencode-
    // payloads.test.js` instead, against the plugin file itself.
    for (const [toolId, config] of registeredAiTools) {
      const host = config.telemetryJournalHost;
      const hookReachesToolUse = host !== undefined;

      expect(
        config.telemetryTaskAttributable,
        `"${toolId}" declares telemetryTaskAttributable ${config.telemetryTaskAttributable}, but the journal hook ${hookReachesToolUse ? "does" : "never"} dispatch a tool-used event for host "${host}"`
      ).toBe(hookReachesToolUse);
    }
  });

  it("declares what its local-read route supplies, for every tool", () => {
    for (const [toolId, config] of registeredAiTools) {
      const declaration = config.telemetryLocalRead;
      if (declaration.kind !== "declared") continue;
      expect(
        declaration.supplies,
        `"${toolId}" declares a telemetryLocalRead route without saying what it supplies`
      ).toBeDefined();
    }
  });
});

/**
 * Where each tool installs a rule, pinned as a table rather than described.
 *
 * The plugin script this replaced carried its own copy of these five rows and was missing
 * one: it stated "Codex CLI: rules not supported, skipped" while `.codex/rules/` is exactly
 * where a Codex rule lands. A reader on a Codex project asking what rules it had was
 * answered "none", silently and wrongly, because the copy had drifted from the installer.
 *
 * Written out here so the drift cannot come back quietly: a tool whose install path moves,
 * or a sixth tool added with rules, fails this and is read by whoever changes it.
 */
describe("every tool says where its own installed rules live", () => {
  const EXPECTED: Readonly<Record<string, { directory: string; extension: string }>> = {
    claude: { directory: ".claude/rules/", extension: ".md" },
    codex: { directory: ".codex/rules/", extension: ".md" },
    copilot: { directory: ".github/instructions/", extension: ".instructions.md" },
    cursor: { directory: ".cursor/rules/", extension: ".mdc" },
    opencode: { directory: ".opencode/rules/", extension: ".md" },
  };

  it("answers the directory and extension each one actually installs into", () => {
    const answered = Object.fromEntries(
      AI_TOOL_IDS.map((id) => {
        const tool = getToolConfig(id);
        const rules = isAiTool(tool) && hasRules(tool) ? tool.capabilities.rules : undefined;
        return [id, rules?.installedLocation() ?? null];
      })
    );

    expect(answered).toEqual(EXPECTED);
  });
});
