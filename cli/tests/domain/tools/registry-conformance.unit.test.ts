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
import {
  getAllRegisteredTools,
  getToolConfig,
  isAiTool,
  journalHostToAiToolId,
} from "../../../src/domain/tools/registry.js";
import { telemetryCostReaders } from "../../helpers/telemetry-cost-readers.js";
import { journalFileWrites, journalHost } from "../../helpers/telemetry-journal-hook.js";

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

    // The type system already requires `telemetry`; this pins the kind, which a literal
    // could still get wrong.
    it("declares a telemetry activation with a recognized kind", () => {
      expect(
        ["settings-file", "environment-variable", "planned", "external"],
        `${toolId} declares an unrecognized telemetry kind: ${tool.telemetry.kind}`
      ).toContain(tool.telemetry.kind);
    });

    // Same shape guard for the export declaration phase 1 of #647 added: the type system
    // requires `telemetryExport` to exist, but not that its `kind` is one of the two this
    // union defines — a typo here would silently widen to `unmeasured`-shaped `undefined`
    // fields rather than fail loudly.
    it("declares its export shape as either measured or explicitly unmeasured", () => {
      expect(
        ["declared", "unmeasured"],
        `${toolId} declares an unrecognized telemetryExport kind: ${tool.telemetryExport.kind}`
      ).toContain(tool.telemetryExport.kind);
      if (tool.telemetryExport.kind === "declared") {
        expect(
          tool.telemetryExport.identityAttribute.length,
          `${toolId}: telemetryExport.identityAttribute must not be empty`
        ).toBeGreaterThan(0);
      }
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

// Exact values, not just shape: this is what phase 1's own acceptance criterion asks for
// — "asserted for all five" — and it is the test that catches a future contributor
// quietly guessing an unmeasured tool's attribute name instead of declaring it unmeasured.
describe("telemetryExport — exact declarations, measured 2026-08-13/14", () => {
  const EXPECTED: Record<string, { kind: "declared" | "unmeasured"; identityAttribute?: string }> =
    {
      claude: { kind: "declared", identityAttribute: "session.id" },
      codex: { kind: "declared", identityAttribute: "conversation.id" },
      copilot: { kind: "declared", identityAttribute: "gen_ai.conversation.id" },
      // Documentation names an attribute; no payload was ever captured. Unmeasured.
      cursor: { kind: "unmeasured" },
      opencode: { kind: "unmeasured" },
    };

  it.each(Object.entries(EXPECTED))("%s", (toolId, expected) => {
    const tool = registeredAiTools.find(([id]) => id === toolId)?.[1];
    if (!tool) throw new Error(`${toolId} is not registered`);

    const shape = tool.telemetryExport;
    expect(shape.kind).toBe(expected.kind);
    if (shape.kind === "declared" && expected.kind === "declared") {
      expect(shape.identityAttribute).toBe(expected.identityAttribute);
    }
  });

  it("covers exactly the five registered AI tools — no tool escapes this check", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(registeredAiTools.map(([id]) => id).sort());
  });
});

// Copilot and Cursor's local-read reasons are measured facts (see spec.md non-goals), not
// guesses. Claude and Codex are declared as of phase 2: read via TranscriptCostReaderAdapter,
// see claude-code-transcript.ts and codex-rollout.ts for their measurements. OpenCode is
// declared as of phase 3: read via OpencodeCostReaderAdapter.
describe("telemetryLocalRead — exact declarations, phase 2 of local-cost-read", () => {
  const EXPECTED: Record<
    string,
    { kind: "declared" | "unmeasured" | "unsupported"; reason?: string }
  > = {
    claude: { kind: "declared" },
    codex: { kind: "declared" },
    opencode: { kind: "declared" },
    copilot: { kind: "unsupported", reason: "outputTokens" },
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

  it("declares task attributability exactly where the journal hook can read a written path", () => {
    // The hook's table is the truth and lives in a script this side cannot import. A tool
    // gaining an extractor without a declaration would silently never be attributed to a
    // task; one declaring it without an extractor would be attributed to none and look
    // broken. Both fail here, by name.
    for (const [toolId, config] of registeredAiTools) {
      const host = config.telemetryJournalHost;
      const hookCanRead =
        host !== undefined && host in journalFileWrites.WRITTEN_PATH_EXTRACTOR_BY_HOST;

      expect(
        config.telemetryTaskAttributable,
        `"${toolId}" declares telemetryTaskAttributable ${config.telemetryTaskAttributable}, but the journal hook ${hookCanRead ? "can" : "cannot"} read a written path for host "${host}"`
      ).toBe(hookCanRead);
    }
  });

  it("agrees with the plugin's own cost-report declaration on journalAttributable", () => {
    // Two builds of one fact: the CLI computes journalAttributable from
    // telemetryJournalHost (report-cost-use-case.ts), and the plugin's standalone scripts
    // declare it directly in readers.js so a live session can compute the same report
    // without the `aidd` package. Nothing pinned them together before, and they drifted -
    // Cursor was declared journal-attributable in one and not in the other. This is that
    // pin: change either side without the other and this fails, by name.
    for (const [toolId, config] of registeredAiTools) {
      const fromCli = config.telemetryJournalHost !== undefined;
      const fromPlugin = telemetryCostReaders.TOOLS.find((t) => t.tool === toolId);
      expect(
        fromPlugin,
        `"${toolId}" is a registered AI tool with no matching entry in the plugin's readers.js TOOLS`
      ).toBeDefined();
      expect(
        fromPlugin?.capability.journalAttributable,
        `"${toolId}": CLI computes journalAttributable ${fromCli} from telemetryJournalHost, but the plugin's readers.js declares ${fromPlugin?.capability.journalAttributable}`
      ).toBe(fromCli);
    }
  });

  it("declares what every readable route supplies, for every tool", () => {
    for (const [toolId, config] of registeredAiTools) {
      for (const [route, declaration] of [
        ["telemetryExport", config.telemetryExport],
        ["telemetryLocalRead", config.telemetryLocalRead],
      ] as const) {
        if (declaration.kind !== "declared") continue;
        expect(
          declaration.supplies,
          `"${toolId}" declares a ${route} route without saying what it supplies`
        ).toBeDefined();
      }
    }
  });
});
