import { describe, expect, it } from "vitest";
import {
  diagnoseTelemetryClaims,
  type TelemetryClaim,
  type TelemetryClaimId,
  type TelemetryClaimJournal,
  type TelemetryClaimToolRead,
  type TelemetryEvidence,
} from "../../../src/domain/models/telemetry-claim.js";

const RUNS_DIR_LABEL = "aidd_docs/runs";

function journal(overrides: Partial<TelemetryClaimJournal> = {}): TelemetryClaimJournal {
  return { vendorId: undefined, sessionStartAt: undefined, turnClosed: false, ...overrides };
}

function toolRead(overrides: Partial<TelemetryClaimToolRead> = {}): TelemetryClaimToolRead {
  return { tool: "claude", sessionFound: false, hasIntervals: false, records: [], ...overrides };
}

function evidence(overrides: Partial<TelemetryEvidence> = {}): TelemetryEvidence {
  return {
    journals: [],
    toolReads: [],
    runsDirLabel: RUNS_DIR_LABEL,
    exportConfig: null,
    ...overrides,
  };
}

function claim(
  result: readonly TelemetryClaim[],
  id: TelemetryClaimId
): TelemetryClaim | undefined {
  return result.find((c) => c.claim === id);
}

describe("diagnoseTelemetryClaims — hook fired", () => {
  it("reads ok once the current session's own run file is found among them", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        journals: [journal({ vendorId: "s-1", sessionStartAt: "2026-08-20T09:00:00Z" })],
        currentSessionId: "s-1",
      })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("ok");
    expect(hookFired?.reason).toBe("session-anchored");
    expect(hookFired?.detail).toMatch(/1 run file\(s\)/u);
  });

  it("names the hook never having fired when no run file appears", () => {
    const result = diagnoseTelemetryClaims(evidence({ currentSessionId: "s-1" }));
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("fail");
    expect(hookFired?.reason).toBe("hook-never-fired");
    expect(hookFired?.detail).toMatch(/never been observed firing/u);
  });

  it("names an unrecognised payload as its own fault, distinct from never firing", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ currentSessionId: "s-1", unrecognisedPayloadAt: "2026-08-22T09:00:00Z" })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("fail");
    expect(hookFired?.reason).toBe("unrecognised-payload");
    expect(hookFired?.detail).toContain("2026-08-22T09:00:00Z");
  });

  it("does not read a torn run file (session-less) as an unrecognised payload without the marker", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ journals: [journal({ vendorId: undefined })], currentSessionId: "s-1" })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.reason).toBe("hook-never-fired");
  });

  it("names this session as having left no run file when an older one exists but not its own", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        journals: [journal({ vendorId: "s-old", sessionStartAt: "2026-07-01T09:00:00Z" })],
        currentSessionId: "s-current",
      })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("fail");
    expect(hookFired?.reason).toBe("session-left-no-run-file");
    expect(hookFired?.detail).toContain("2026-07-01T09:00:00Z");
  });

  it("cannot tell whether this session's hook fired without an anchor", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ journals: [journal({ vendorId: "s-1", sessionStartAt: "2026-08-20T09:00:00Z" })] })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("unknown");
    expect(hookFired?.reason).toBe("no-session-anchor");
  });

  it("names an untrusted Codex hook, not never having fired, when the trust state says so", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        currentSessionId: "codex-1",
        hookTrust: { readable: true, trusted: false, configPath: "/home/.codex/config.toml" },
      })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("fail");
    expect(hookFired?.reason).toBe("untrusted-codex-hook");
    expect(hookFired?.detail).toContain("--dangerously-bypass-hook-trust");
  });

  it("still names the generic never-fired fault once the hook is actually trusted", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        currentSessionId: "codex-1",
        hookTrust: { readable: true, trusted: true, configPath: "/home/.codex/config.toml" },
      })
    );
    expect(claim(result, "hook-fired")?.reason).toBe("hook-never-fired");
  });

  it("says the trust state could not itself be read, rather than guessing", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        currentSessionId: "codex-1",
        hookTrust: {
          readable: false,
          reason: "/home/.codex/config.toml could not be read (ENOENT)",
        },
      })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.reason).toBe("hook-never-fired");
    expect(hookFired?.detail).toMatch(/could not be read either/u);
  });

  it("says nothing about trust for a tool with no trust gate", () => {
    const result = diagnoseTelemetryClaims(evidence({ currentSessionId: "claude-1" }));
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.detail).not.toMatch(/trust/u);
  });

  it("names an untrusted hook for this session too, when an older session left a run file but this one did not", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        journals: [journal({ vendorId: "s-old", sessionStartAt: "2026-07-01T09:00:00Z" })],
        currentSessionId: "codex-current",
        hookTrust: { readable: true, trusted: false, configPath: "/home/.codex/config.toml" },
      })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.reason).toBe("untrusted-codex-hook");
    expect(hookFired?.detail).not.toMatch(/this session left no run file/u);
  });
});

describe("diagnoseTelemetryClaims — session journalled", () => {
  it("reads ok when a run file closed its turn", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ journals: [journal({ vendorId: "s-1", turnClosed: true })] })
    );
    expect(claim(result, "session-journalled")?.verdict).toBe("ok");
  });

  it("names a run file that carries only session_start", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ journals: [journal({ vendorId: "s-1", turnClosed: false })] })
    );
    const c = claim(result, "session-journalled");
    expect(c?.verdict).toBe("fail");
    expect(c?.reason).toBe("only-session-start");
  });

  it("has nothing to read when no run file exists", () => {
    const result = diagnoseTelemetryClaims(evidence());
    const c = claim(result, "session-journalled");
    expect(c?.verdict).toBe("unknown");
    expect(c?.reason).toBe("no-run-file-to-read");
  });
});

describe("diagnoseTelemetryClaims — tool files readable", () => {
  it("reads ok once one covered tool found the session", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        journals: [journal({ vendorId: "s-1" })],
        toolReads: [toolRead({ sessionFound: true })],
      })
    );
    expect(claim(result, "tool-files-readable")?.verdict).toBe("ok");
  });

  it("names no session found for any tool, while the journal names one", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        journals: [journal({ vendorId: "s-1" })],
        toolReads: [toolRead({ tool: "claude" }), toolRead({ tool: "codex" })],
      })
    );
    const c = claim(result, "tool-files-readable");
    expect(c?.verdict).toBe("fail");
    expect(c?.detail).toContain("s-1");
  });

  it("has no session to look for when the journal names none", () => {
    const result = diagnoseTelemetryClaims(evidence());
    expect(claim(result, "tool-files-readable")?.verdict).toBe("unknown");
  });

  it("carries the count read against the count attempted, not just the tool that worked", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        journals: [journal({ vendorId: "s-1" })],
        toolReads: [
          toolRead({ tool: "claude", sessionFound: true }),
          toolRead({ tool: "claude", sessionFound: false }),
        ],
      })
    );
    const c = claim(result, "tool-files-readable");
    expect(c?.verdict).toBe("ok");
    expect(c?.detail).toContain("claude: 1 of 2 session(s) read");
  });

  it("names a reader that threw as failing to read, not as a plain miss", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        journals: [journal({ vendorId: "s-1" })],
        toolReads: [
          toolRead({ tool: "claude", sessionFound: false }),
          toolRead({ tool: "codex", sessionFound: false, error: "ENOENT: no such file" }),
        ],
      })
    );
    expect(claim(result, "tool-files-readable")?.detail).toContain(
      "1 read attempt(s) failed: ENOENT"
    );
  });
});

describe("diagnoseTelemetryClaims — records join", () => {
  it("reads ok once a record joined a step", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        toolReads: [
          toolRead({ hasIntervals: true, records: [{ stepAttribution: "journal-interval" }] }),
        ],
      })
    );
    expect(claim(result, "records-join")?.verdict).toBe("ok");
  });

  it("names every record unattributed, not a missing record", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        toolReads: [
          toolRead({
            hasIntervals: true,
            records: [{ stepAttribution: "unattributed" }, { stepAttribution: "unattributed" }],
          }),
        ],
      })
    );
    const c = claim(result, "records-join");
    expect(c?.verdict).toBe("fail");
    expect(c?.reason).toBe("all-unattributed");
  });

  it("has nothing to join when no record was read", () => {
    const result = diagnoseTelemetryClaims(evidence({ toolReads: [toolRead({ records: [] })] }));
    const c = claim(result, "records-join");
    expect(c?.verdict).toBe("unknown");
    expect(c?.reason).toBe("no-record-to-join");
  });

  it("has nothing to join when neither a step interval nor a tool-stated step exists", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        toolReads: [
          toolRead({ hasIntervals: false, records: [{ stepAttribution: "unattributed" }] }),
        ],
      })
    );
    const c = claim(result, "records-join");
    expect(c?.verdict).toBe("unknown");
    expect(c?.reason).toBe("no-join-material");
  });
});

describe("diagnoseTelemetryClaims — export configured", () => {
  it("reads ok once the tool's own settings carry a working endpoint", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        exportConfig: {
          configured: true,
          configuredDetail: "OTLP to 127.0.0.1:4318 (.claude/settings.local.json)",
          identityDisabled: false,
        },
      })
    );
    const c = claim(result, "export-configured");
    expect(c?.verdict).toBe("ok");
    expect(c?.detail).toContain("127.0.0.1:4318");
  });

  it("names the missing setting, not a generic failure, when nothing turned it on", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        exportConfig: {
          configured: false,
          missingDetail:
            "CLAUDE_CODE_ENABLE_TELEMETRY=1 is not set, across .claude/settings.local.json",
          identityDisabled: false,
        },
      })
    );
    const c = claim(result, "export-configured");
    expect(c?.verdict).toBe("fail");
    expect(c?.reason).toBe("export-missing");
    expect(c?.detail).toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
  });

  it("has no session anchor to tell whose export settings to check", () => {
    const result = diagnoseTelemetryClaims(evidence({ exportConfig: null }));
    const c = claim(result, "export-configured");
    expect(c?.verdict).toBe("unknown");
    expect(c?.reason).toBe("no-session-anchor-for-export");
  });
});

describe("diagnoseTelemetryClaims — identifier joinable", () => {
  it("reads ok once an exported record carries the identity attribute", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        exportConfig: { configured: true, identityDisabled: false },
        exportedRecord: { vendorField: "session.id" },
      })
    );
    const c = claim(result, "identifier-joinable");
    expect(c?.verdict).toBe("ok");
    expect(c?.detail).toContain("session.id");
  });

  it("names the disabling setting, not an absence of data, when identity is disabled", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        exportConfig: {
          configured: true,
          identityDisabled: true,
          identityDisabledDetail: "OTEL_METRICS_INCLUDE_SESSION_ID=false strips the identifier",
        },
      })
    );
    const c = claim(result, "identifier-joinable");
    expect(c?.verdict).toBe("fail");
    expect(c?.reason).toBe("identity-disabled");
    expect(c?.detail).toContain("OTEL_METRICS_INCLUDE_SESSION_ID");
  });

  it("has nothing to join when no export is configured at all", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ exportConfig: { configured: false, identityDisabled: false } })
    );
    const c = claim(result, "identifier-joinable");
    expect(c?.verdict).toBe("unknown");
    expect(c?.reason).toBe("no-export-to-join");
  });

  it("has nothing to join yet when export is configured but no record has reached the sink", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ exportConfig: { configured: true, identityDisabled: false } })
    );
    const c = claim(result, "identifier-joinable");
    expect(c?.verdict).toBe("unknown");
    expect(c?.reason).toBe("export-configured-no-record-yet");
  });
});

describe("diagnoseTelemetryClaims — the whole set", () => {
  it("always returns exactly six claims, in the fixed order, none of them ever unjudged", () => {
    const result = diagnoseTelemetryClaims(evidence());
    expect(result.map((c) => c.claim)).toEqual([
      "hook-fired",
      "session-journalled",
      "tool-files-readable",
      "records-join",
      "export-configured",
      "identifier-joinable",
    ]);
    for (const c of result) expect(["ok", "fail", "unknown"]).toContain(c.verdict);
  });
});
