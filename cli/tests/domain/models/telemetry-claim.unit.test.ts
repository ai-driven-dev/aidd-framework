import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    // The conservative default every pre-existing test relies on: nothing here declares
    // the recorder, so an empty journal reads as the failure it already did before this
    // fact existed. A test for the declared branch sets this explicitly.
    recorderDeclared: false,
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

  it("reports nothing to evaluate, never a failure, when the recorder is declared but no run file has appeared", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ currentSessionId: "s-1", recorderDeclared: true })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("unknown");
    expect(hookFired?.reason).toBe("recorder-declared-not-yet-fired");
    expect(hookFired?.detail).toMatch(/declaration is not proof/u);
    expect(hookFired?.detail).toMatch(/claude-cli-adapter\.ts/u);
  });

  it("names the recorder as what is missing when it is declared nowhere and no run file has appeared", () => {
    const result = diagnoseTelemetryClaims(
      evidence({ currentSessionId: "s-1", recorderDeclared: false })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.verdict).toBe("fail");
    expect(hookFired?.detail).toMatch(/recorder is declared nowhere/u);
  });

  it("lets an untrusted Codex hook explain the absence ahead of either new reason, even when the recorder is declared", () => {
    const result = diagnoseTelemetryClaims(
      evidence({
        currentSessionId: "codex-1",
        recorderDeclared: true,
        hookTrust: { readable: true, trusted: false, configPath: "/home/.codex/config.toml" },
      })
    );
    const hookFired = claim(result, "hook-fired");
    expect(hookFired?.reason).toBe("untrusted-codex-hook");
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

describe("diagnoseTelemetryClaims — the whole set", () => {
  it("always returns exactly four claims, in the fixed order, none of them ever unjudged", () => {
    const result = diagnoseTelemetryClaims(evidence());
    expect(result.map((c) => c.claim)).toEqual([
      "hook-fired",
      "session-journalled",
      "tool-files-readable",
      "records-join",
    ]);
    for (const c of result) expect(["ok", "fail", "unknown"]).toContain(c.verdict);
  });

  it("no claim mentions exporting, a destination, or an identity attribute", () => {
    const result = diagnoseTelemetryClaims(evidence());
    for (const c of result) {
      expect(c.detail.toLowerCase()).not.toMatch(/export|endpoint|identifier|identity/u);
    }
  });

  it("no claim recommends a command the system no longer offers", () => {
    const result = diagnoseTelemetryClaims(evidence());
    for (const c of result) {
      expect(c.detail.toLowerCase()).not.toMatch(/\breceive\b|\bendpoint\b/u);
    }
  });
});

// The failure this guards against, verbatim from the plan: "A shape change whose consumer
// is not updated in the same commit is how the cost skill was halted by a version pin,
// twice." The consumer here is every file phase 3 named as stating the claim count in
// prose - `02-check/SKILL.md` and `actions/02-diagnose.md`, the second added after review
// found the first alone left the file phase 3 itself called out as "the one that hard-coded
// 'all six claims'" still unguarded (review.md, "one route, and every sentence about it
// true", finding 7). This reads both as text, the same way a person or an agent would,
// rather than trusting that whoever next changes the claim count remembers to touch every
// file that states it.
describe("the diagnostic skill states the claims the command prints, in the number it prints them", () => {
  const SKILL_DIR = resolve(process.cwd(), "..", "plugins", "aidd-telemetry", "skills", "02-check");
  const CLAIM_COUNT_FILES = [
    resolve(SKILL_DIR, "SKILL.md"),
    resolve(SKILL_DIR, "actions", "02-diagnose.md"),
  ];

  const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };

  // Every cardinal "<word> claim(s)" mention in one file, not only the first: 02-diagnose.md
  // states the count three times in prose, and a guard that stops at the first match would
  // leave the second and third free to drift unnoticed, which is exactly how it went stale
  // the first time.
  function statedClaimCounts(path: string): readonly number[] {
    const text = readFileSync(path, "utf8");
    const matches = [
      ...text.matchAll(/\b(one|two|three|four|five|six|seven|eight)\s+claims?\b/giu),
    ];
    if (matches.length === 0) {
      throw new Error(
        `${path} no longer states a claim count in words — update this check's regex ` +
          "(and keep it able to fail) if the wording changed on purpose"
      );
    }
    return matches.map((match) => {
      const word = match[1]?.toLowerCase() ?? "";
      const count = NUMBER_WORDS[word];
      if (count === undefined) throw new Error(`unrecognised claim-count word: ${match[1]}`);
      return count;
    });
  }

  it("agrees with the actual number of claims diagnoseTelemetryClaims prints, everywhere it is stated", () => {
    const actual = diagnoseTelemetryClaims(evidence()).length;
    for (const path of CLAIM_COUNT_FILES) {
      for (const stated of statedClaimCounts(path)) {
        expect(stated).toBe(actual);
      }
    }
  });
});

// Extends the guard above to the account phase 2 added: two readings of the same absence
// ("no run file yet"), told apart only by the recorder's own declaration. A marker phrase
// is read from the live code's own detail text, then required in the skill's prose too —
// so a change on either side alone (the wording in `telemetry-claim.ts`, or the account in
// `02-diagnose.md`) fails this test, never only a change to both together.
describe("the diagnostic skill's account of the declared/nowhere split matches the command's own reasons", () => {
  const DIAGNOSE_MD = resolve(
    process.cwd(),
    "..",
    "plugins",
    "aidd-telemetry",
    "skills",
    "02-check",
    "actions",
    "02-diagnose.md"
  );
  const DIAGNOSE_TEXT = readFileSync(DIAGNOSE_MD, "utf8");

  function hookFiredDetail(recorderDeclared: boolean): string {
    const result = diagnoseTelemetryClaims(evidence({ currentSessionId: "s-1", recorderDeclared }));
    const detail = claim(result, "hook-fired")?.detail;
    if (detail === undefined) throw new Error("hook-fired claim missing from the result");
    return detail;
  }

  it("states, on both sides, that a declared recorder with no run file yet is nothing to evaluate", () => {
    const marker = "nothing to evaluate";
    expect(hookFiredDetail(true).toLowerCase()).toContain(marker);
    expect(DIAGNOSE_TEXT.toLowerCase()).toContain(marker);
  });

  it("states, on both sides, that a declaration is not proof the hook will fire", () => {
    const marker = "declaration is not proof";
    expect(hookFiredDetail(true).toLowerCase()).toContain(marker);
    expect(DIAGNOSE_TEXT.toLowerCase()).toContain(marker);
  });

  it("states, on both sides, that a recorder declared nowhere is what is missing", () => {
    const marker = "declared nowhere";
    expect(hookFiredDetail(false).toLowerCase()).toContain(marker);
    expect(DIAGNOSE_TEXT.toLowerCase()).toContain(marker);
  });
});
