import { describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { DiagnoseTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/diagnose-telemetry-use-case.js";
import type { TelemetryCodexHookTrust } from "../../../../src/domain/models/telemetry-claim.js";
import type { AiToolId } from "../../../../src/domain/models/tool-ids.js";
import type { HookTrustReader } from "../../../../src/domain/ports/hook-trust-reader.js";
import type { RunJournal } from "../../../../src/domain/ports/run-journal-reader.js";
import type {
  LocalCostCandidateRecord,
  LocalCostReadResult,
  SessionCostReader,
} from "../../../../src/domain/ports/session-cost-reader.js";
import type { VersionControl } from "../../../../src/domain/ports/version-control.js";
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
    installPreCommitDelegate: async () => {},
    getRemoteUrl: async () => null,
    listTrackedFiles: async () => [],
    isRepository: async () => isRepository,
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
    new InMemoryTelemetrySink()
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
      "hook-never-fired"
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
