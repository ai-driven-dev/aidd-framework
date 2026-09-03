import { describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { DiagnoseTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/diagnose-telemetry-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { Plugin } from "../../../../src/domain/models/plugin.js";
import type { TelemetryCodexHookTrust } from "../../../../src/domain/models/telemetry-claim.js";
import type { AiToolId } from "../../../../src/domain/models/tool-ids.js";
import type { HookTrustReader } from "../../../../src/domain/ports/hook-trust-reader.js";
import type { HostPluginRegistryReader } from "../../../../src/domain/ports/host-plugin-registry-reader.js";
import type { ManifestRepository } from "../../../../src/domain/ports/manifest-repository.js";
import type { RunJournal } from "../../../../src/domain/ports/run-journal-reader.js";
import type {
  LocalCostCandidateRecord,
  LocalCostReadResult,
  SessionCostReader,
} from "../../../../src/domain/ports/session-cost-reader.js";
import type { VersionControl } from "../../../../src/domain/ports/version-control.js";
import { FakeCurrentVersion } from "../../../helpers/ports/fake-current-version.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryPersonIdentityStore } from "../../../helpers/ports/in-memory-person-identity-store.js";
import { InMemoryRunJournalReader } from "../../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";
import { StubTelemetryEvidenceReader as StubEvidenceReader } from "../../../helpers/ports/stub-telemetry-evidence-reader.js";

class StubHookTrustReader implements HookTrustReader {
  trust: TelemetryCodexHookTrust = {
    readable: true,
    trusted: true,
    configPath: "/home/.codex/config.toml",
  };

  async read(): Promise<TelemetryCodexHookTrust> {
    return this.trust;
  }
}

function versionControl(isRepository: boolean): VersionControl {
  return {
    installCommitMessageDelegate: async () => false,
    removeCommitMessageDelegate: async () => false,
    getRemoteUrl: async () => null,
    listTrackedFiles: async () => [],
    isRepository: async () => isRepository,
    readCommitTrailerSetup: async () => ({
      delegate: "absent" as const,
      callSite: "no-hook-file" as const,
      hookHasOtherContent: false,
    }),
    hasHistoryFor: async () => false,
  };
}

class StubSessionCostReader implements SessionCostReader {
  constructor(
    private readonly result: LocalCostReadResult = { records: [], sessionFound: false },
    private readonly failure?: string
  ) {}

  async read(): Promise<LocalCostReadResult> {
    if (this.failure !== undefined) throw new Error(this.failure);
    return this.result;
  }
}

function sessionStart(vendorId: string, at = "2026-08-20T09:00:00Z"): RunJournal["session"] {
  return {
    type: "session_start",
    at,
    run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    tool: "claude-code",
    vendor_id: vendorId,
  };
}

function candidate(overrides: Partial<LocalCostCandidateRecord> = {}): LocalCostCandidateRecord {
  return {
    kind: "request",
    vendor_id: "s-1",
    vendor_field: "session_id",
    event_timestamp: "2026-08-20T09:01:00Z",
    ...overrides,
  };
}

function buildUseCase(options: {
  evidence?: StubEvidenceReader;
  isRepository?: boolean;
  journals?: readonly RunJournal[];
  readers?: ReadonlyMap<AiToolId, SessionCostReader>;
  hookTrustReader?: StubHookTrustReader;
  manifestRepo?: ManifestRepository;
  hostRegistries?: ReadonlyMap<AiToolId, HostPluginRegistryReader>;
}) {
  const evidence = options.evidence ?? new StubEvidenceReader();
  const journalReader = new InMemoryRunJournalReader();
  for (const [index, journal] of (options.journals ?? []).entries()) {
    journalReader.set(journal.session?.vendor_id ?? `no-session-${index}`, journal);
  }
  const hookTrustReader = options.hookTrustReader ?? new StubHookTrustReader();
  const useCase = new DiagnoseTelemetryUseCase(
    evidence,
    versionControl(options.isRepository ?? true),
    journalReader,
    options.readers ?? new Map(),
    hookTrustReader,
    new InMemoryPersonIdentityStore(),
    new InMemoryTelemetrySink(),
    new FakeCurrentVersion("9.9.9-check"),
    options.manifestRepo ?? {
      path: "/test-project/.aidd/manifest.json",
      load: async () => null,
      save: async () => {},
      delete: async () => {},
    },
    options.hostRegistries ?? new Map()
  );
  return { useCase, evidence, hookTrustReader };
}

function runOptions(env: NodeJS.ProcessEnv = {}) {
  return { projectRoot: "/repo", homeDir: "/home/dev", env };
}

describe("DiagnoseTelemetryUseCase — gating", () => {
  it("stops at the switch before judging anything else", async () => {
    const evidence = new StubEvidenceReader();
    evidence.enabled = false;
    const { useCase } = buildUseCase({ evidence });

    const result = await useCase.execute(runOptions());

    expect(result.gate).toMatch(/measurement is off/u);
    expect("claims" in result).toBe(false);
  });

  it("names a non-repository, never blaming the hook, once the switch is on", async () => {
    const { useCase } = buildUseCase({ isRepository: false });

    const result = await useCase.execute(runOptions());

    expect(result.gate).toMatch(/not a git repository/u);
  });
});

// Finding 1 (review.md, "one route, and every sentence about it true"): a stale export in
// a tool's own settings file exports whether or not this project's own switch is on, so it
// is gathered and reported on both sides of the gate, never folded into a claim.
describe("DiagnoseTelemetryUseCase — a leftover export config", () => {
  const LEFTOVER = [
    { path: "/repo/.claude/settings.local.json", keys: ["CLAUDE_CODE_ENABLE_TELEMETRY"] },
  ];

  it("is reported even when the switch is off and the run is gated", async () => {
    const evidence = new StubEvidenceReader();
    evidence.enabled = false;
    evidence.leftoverExport = LEFTOVER;
    const { useCase } = buildUseCase({ evidence });

    const result = await useCase.execute(runOptions());

    expect(result.gate).toMatch(/measurement is off/u);
    expect(result.leftoverExportConfig).toEqual(LEFTOVER);
  });

  it("is reported alongside the four claims when the switch is on", async () => {
    const evidence = new StubEvidenceReader();
    evidence.leftoverExport = LEFTOVER;
    const { useCase } = buildUseCase({ evidence });

    const result = await useCase.execute(runOptions());

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(result.leftoverExportConfig).toEqual(LEFTOVER);
    // Never folded into the health count: "no claim mentions exporting" is a hard rule
    // (telemetry-claim.unit.test.ts) this must not get near.
    expect(result.claims.some((claim) => claim.claim.toString().includes("export"))).toBe(false);
  });

  it("reports an empty list on a clean machine, never omitting the field", async () => {
    const { useCase } = buildUseCase({});

    const result = await useCase.execute(runOptions());

    expect(result.leftoverExportConfig).toEqual([]);
  });
});

describe("DiagnoseTelemetryUseCase — gathering local evidence", () => {
  it("reads every covered tool's own files for every journalled session", async () => {
    const journal: RunJournal = {
      session: sessionStart("s-1"),
      boundaries: [
        { type: "step_start", at: "2026-08-20T09:00:30Z", skill: "aidd-dev:02-implement" },
      ],
      filesWritten: [],
      taskDeclarations: [],
    };
    const claudeReader = new StubSessionCostReader({ records: [candidate()], sessionFound: true });
    const { useCase } = buildUseCase({
      journals: [journal],
      readers: new Map([["claude", claudeReader]]),
    });

    const result = await useCase.execute(runOptions({ CLAUDE_CODE_SESSION_ID: "s-1" }));

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(result.claims.find((c) => c.claim === "tool-files-readable")?.verdict).toBe("ok");
    expect(result.claims.find((c) => c.claim === "records-join")?.verdict).toBe("ok");
  });

  it("names a reader that threw as failing to read, never crashing the whole diagnostic", async () => {
    const journal: RunJournal = {
      session: sessionStart("s-1"),
      boundaries: [],
      filesWritten: [],
      taskDeclarations: [],
    };
    const brokenReader = new StubSessionCostReader(undefined, "ENOENT: no such file");
    const { useCase } = buildUseCase({
      journals: [journal],
      readers: new Map([["claude", brokenReader]]),
    });

    const result = await useCase.execute(runOptions());

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(result.claims.find((c) => c.claim === "tool-files-readable")?.detail).toContain(
      "ENOENT"
    );
  });

  it("only consults Codex's own hook trust for a Codex-anchored session", async () => {
    const hookTrustReader = new StubHookTrustReader();
    hookTrustReader.trust = {
      readable: true,
      trusted: false,
      configPath: "/home/.codex/config.toml",
    };
    const { useCase } = buildUseCase({ hookTrustReader });

    const claudeAnchored = await useCase.execute(runOptions({ CLAUDE_CODE_SESSION_ID: "s-1" }));
    if (claudeAnchored.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(claudeAnchored.claims.find((c) => c.claim === "hook-fired")?.reason).toBe(
      "recorder-declared-nowhere"
    );

    const codexAnchored = await useCase.execute(runOptions({ CODEX_THREAD_ID: "codex-1" }));
    if (codexAnchored.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(codexAnchored.claims.find((c) => c.claim === "hook-fired")?.reason).toBe(
      "untrusted-codex-hook"
    );
  });

  it("names every uncovered tool with its own reason", async () => {
    const { useCase } = buildUseCase({});

    const result = await useCase.execute(runOptions());

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(result.uncovered.length).toBeGreaterThan(0);
    for (const uncovered of result.uncovered) expect(uncovered.reason.length).toBeGreaterThan(0);
  });
});

describe("DiagnoseTelemetryUseCase — every claim is judged", () => {
  it("never lets absent evidence produce an ok: no claim is ever left unjudged", async () => {
    const { useCase } = buildUseCase({});

    const result = await useCase.execute(runOptions());

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    for (const claim of result.claims) expect(["ok", "fail", "unknown"]).toContain(claim.verdict);
  });
});

// The wiring proof for "not yet" stops being a failure: the same declaration
// `gatherSetup` already read for the stated half is what the first claim judges by — never
// the absence of a run file, which looks identical either way.
describe("DiagnoseTelemetryUseCase — the first claim reads the same declaration setup prints", () => {
  it("reports nothing to evaluate when the setup's own recorder declaration is true", async () => {
    const evidence = new StubEvidenceReader();
    evidence.recorderDeclaration = {
      declared: true,
      declaredAt: ["/repo/.claude/settings.json"],
      locationsChecked: ["/repo/.aidd/manifest.json", "/repo/.claude/settings.json"],
      unreadable: [],
    };
    const { useCase } = buildUseCase({ evidence });

    const result = await useCase.execute(runOptions());

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(result.setup.recorderDeclaration.declared).toBe(true);
    const hookFired = result.claims.find((c) => c.claim === "hook-fired");
    expect(hookFired?.verdict).toBe("unknown");
    expect(hookFired?.reason).toBe("recorder-declared-not-yet-fired");
  });

  it("fails, naming the recorder, when the setup's own recorder declaration is false", async () => {
    const evidence = new StubEvidenceReader();
    evidence.recorderDeclaration = {
      declared: false,
      declaredAt: [],
      locationsChecked: ["/repo/.aidd/manifest.json"],
      unreadable: [],
    };
    const { useCase } = buildUseCase({ evidence });

    const result = await useCase.execute(runOptions());

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    expect(result.setup.recorderDeclaration.declared).toBe(false);
    const hookFired = result.claims.find((c) => c.claim === "hook-fired");
    expect(hookFired?.verdict).toBe("fail");
    expect(hookFired?.detail).toMatch(/recorder is declared nowhere/u);
  });

  it("reads unknown, never a failure, when the setup's own recorder declaration could not be read", async () => {
    const evidence = new StubEvidenceReader();
    evidence.recorderDeclaration = {
      declared: false,
      declaredAt: [],
      locationsChecked: ["/repo/.aidd/manifest.json", "/repo/.claude/settings.json"],
      unreadable: ["/repo/.claude/settings.json"],
    };
    const { useCase } = buildUseCase({ evidence });

    const result = await useCase.execute(runOptions());

    if (result.gate !== undefined) throw new Error("expected the run to pass the gate");
    const hookFired = result.claims.find((c) => c.claim === "hook-fired");
    expect(hookFired?.verdict).toBe("unknown");
    expect(hookFired?.reason).toBe("recorder-declaration-unreadable");
    expect(hookFired?.detail).not.toContain("FAIL");
  });
});

/**
 * Which build produced what a person is reading.
 *
 * Neither version reached any output before this: `cli_version` and `plugin_version` were
 * written onto records and journal lines that only a person opening `~/.config/aidd` by
 * hand would ever see. `check` is the command whose job is telling someone the state of
 * their setup, so it is where they belong.
 */
describe("the versions check reports", () => {
  function sessionAt(at: string, pluginVersion?: string): RunJournal {
    return {
      boundaries: [],
      filesWritten: [],
      taskDeclarations: [],
      session: {
        type: "session_start",
        at,
        run_id: `run-${at}`,
        tool: "claude-code",
        vendor_id: `vendor-${at}`,
        ...(pluginVersion === undefined ? {} : { plugin_version: pluginVersion }),
      },
    };
  }

  it("names this CLI's own version, which a person always has since nothing reads without it", async () => {
    const { useCase } = buildUseCase({});

    const result = await useCase.execute(runOptions());

    expect(result.setup.versions.cli).toBe("9.9.9-check");
  });

  it("reports the plugin version the hook itself stamped, never one re-derived here", async () => {
    const { useCase } = buildUseCase({ journals: [sessionAt("2026-09-01T10:00:00Z", "0.1.0")] });

    const result = await useCase.execute(runOptions());

    expect(result.setup.versions.plugin).toEqual({ kind: "recorded", version: "0.1.0" });
  });

  it("reports the newest, so an upgrade mid-period is not hidden by the sessions before it", async () => {
    const { useCase } = buildUseCase({
      journals: [
        sessionAt("2026-09-01T10:00:00Z", "0.1.0"),
        sessionAt("2026-09-02T10:00:00Z", "0.2.0"),
      ],
    });

    const result = await useCase.execute(runOptions());

    expect(result.setup.versions.plugin).toEqual({ kind: "recorded", version: "0.2.0" });
  });

  it("skips a session carrying no version rather than letting it hide a later one that does", async () => {
    // A line written before the field existed must not read as "this install is damaged".
    const { useCase } = buildUseCase({
      journals: [sessionAt("2026-09-03T10:00:00Z"), sessionAt("2026-09-01T10:00:00Z", "0.1.0")],
    });

    const result = await useCase.execute(runOptions());

    expect(result.setup.versions.plugin).toEqual({ kind: "recorded", version: "0.1.0" });
  });

  it("tells a project that measured nothing yet apart from one whose hook could not name itself", async () => {
    // The two silences mean different things: nothing journalled says nothing about the
    // plugin, while a journalled session with no version is a plugin that arrived by
    // neither install route. Collapsing them would let "not measured yet" read as damage.
    const nothing = await buildUseCase({}).useCase.execute(runOptions());
    const journalledWithout = await buildUseCase({
      journals: [sessionAt("2026-09-01T10:00:00Z")],
    }).useCase.execute(runOptions());

    expect(nothing.setup.versions.plugin).toEqual({ kind: "nothing-journalled" });
    expect(journalledWithout.setup.versions.plugin).toEqual({ kind: "unrecorded" });
  });
});

/** A repository whose load throws, which is what a hand-edited `.aidd/manifest.json`
 * actually produces: `Manifest`'s parser maps over fields it does not guard. Written as a
 * real implementation of the port rather than a cast, so it cannot drift from it. */
class ThrowingManifestRepository implements ManifestRepository {
  readonly path = "/test-project/.aidd/manifest.json";
  constructor(private readonly failure: Error) {}
  async load(): Promise<Manifest | null> {
    throw this.failure;
  }
  async save(): Promise<void> {}
  async delete(): Promise<void> {}
}

function manifestWithClaudePlugin(marketplace?: string): InMemoryManifestRepository {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.addPlugin(
    "claude",
    Plugin.fromMetadata(
      "aidd-telemetry",
      "1.0.0",
      { kind: "github", repo: "ai-driven-dev/framework" },
      true,
      marketplace
    )
  );
  return new InMemoryManifestRepository(manifest);
}

function registryCarrying(
  refs: readonly string[]
): ReadonlyMap<AiToolId, HostPluginRegistryReader> {
  const reader: HostPluginRegistryReader = {
    read: async () => ({ location: REGISTRY, refs: new Map(refs.map((ref) => [ref, true])) }),
  };
  return new Map<AiToolId, HostPluginRegistryReader>([["claude", reader]]);
}

const REGISTRY = "/home/dev/.claude/plugins/installed_plugins.json";
const REF = "aidd-telemetry@aidd-framework";

describe("DiagnoseTelemetryUseCase — what the host will actually load", () => {
  it("says a plugin the host's registry carries is registered", async () => {
    const { useCase } = buildUseCase({
      manifestRepo: manifestWithClaudePlugin("aidd-framework"),
      hostRegistries: registryCarrying([REF]),
    });

    const result = await useCase.execute(runOptions());

    expect(result.setup.hostRegistration.entries[0]?.answer).toBe("registered");
  });

  // #703 itself, through the use-case: the declaration is fine and the host will drop it.
  it("says a plugin the registry lacks is not registered, and names the file", async () => {
    const { useCase } = buildUseCase({
      manifestRepo: manifestWithClaudePlugin("aidd-framework"),
      hostRegistries: registryCarrying([]),
    });

    const entry = (await useCase.execute(runOptions())).setup.hostRegistration.entries[0];

    expect(entry?.answer).toBe("not-registered");
    expect(entry?.detail).toContain(REGISTRY);
  });

  it("cannot ask any registry about a plugin recorded without a marketplace", async () => {
    const { useCase } = buildUseCase({
      manifestRepo: manifestWithClaudePlugin(undefined),
      hostRegistries: registryCarrying([REF]),
    });

    expect((await useCase.execute(runOptions())).setup.hostRegistration.entries[0]?.answer).toBe(
      "unanswerable"
    );
  });

  /**
   * Verified against the built binary before it was fixed: it printed
   * `Cannot read properties of undefined (reading 'map')` and died. Nothing loaded the
   * manifest from `check` until this fact existed, so that crash is one the diagnostic put
   * on its own path — and a damaged manifest is exactly when someone runs `check`.
   */
  it("survives a manifest it cannot parse, and says so instead of dying", async () => {
    const { useCase } = buildUseCase({
      manifestRepo: new ThrowingManifestRepository(
        new TypeError("Cannot read properties of undefined (reading 'map')")
      ),
    });

    const registration = (await useCase.execute(runOptions())).setup.hostRegistration;

    expect(registration.manifestUnreadable).toContain("map");
    expect(registration.entries).toEqual([]);
  });
});
