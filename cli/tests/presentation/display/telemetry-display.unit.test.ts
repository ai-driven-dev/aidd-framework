import { describe, expect, it } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import type {
  LocalCostToolReport,
  LocalCostToolStatus,
  ReadLocalCostResult,
} from "../../../src/contexts/telemetry/application/read-local-cost-use-case.js";
import type { TelemetrySink } from "../../../src/contexts/telemetry/domain/ports/telemetry-sink.js";
import {
  printLocalCostReadReport,
  printPersonIdentityLink,
  printPersonIdentityOff,
  printPersonIdentityStatus,
  printPersonIdentityUnlink,
  printPersonIdentityUse,
  printTelemetryOffReport,
  printTelemetryOnReport,
  warnIfFiguresMoveTheTokenToo,
} from "../../../src/presentation/display/telemetry-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";
import { InMemoryTelemetrySink } from "../../helpers/ports/in-memory-telemetry-sink.js";

function textOf(output: CapturingOutput): string {
  return output.lines.join("\n");
}

function toolReport(overrides: Partial<LocalCostToolReport> = {}): LocalCostToolReport {
  return {
    tool: "claude",
    status: "found",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 0,
    ...overrides,
  };
}

function readResult(overrides: Partial<ReadLocalCostResult> = {}): ReadLocalCostResult {
  return { sessions: [], toolReports: [], ...overrides };
}

describe("what `telemetry read` says about each tool", () => {
  /** Five of the six statuses mean something other than "this tool billed nothing", so the
   * labels are held apart rather than matched against a wording that may change. */
  it("gives every status a label of its own, so no two can be read as the same fact", () => {
    const statuses: readonly LocalCostToolStatus[] = [
      "found",
      "empty",
      "not-found",
      "unreadable",
      "not-covered",
      "not-asked",
    ];

    const labels = statuses.map((status) => {
      const output = new CapturingOutput();
      printLocalCostReadReport(
        output,
        readResult({
          sessions: [{ sessionId: "s-1", toolReports: [] }],
          toolReports: [toolReport({ status })],
        })
      );
      return output.lines[output.lines.length - 1];
    });

    expect(new Set(labels).size).toBe(statuses.length);
  });

  it("never says a tool found nothing when nothing was ever asked of it", () => {
    const output = new CapturingOutput();

    printLocalCostReadReport(
      output,
      readResult({
        sessions: [{ sessionId: "s-1", toolReports: [] }],
        toolReports: [toolReport({ status: "not-asked" })],
      })
    );

    expect(textOf(output)).not.toMatch(/nothing found/u);
  });

  // A sweep that read nineteen sessions and failed the twentieth still reports the figures
  // as read; the failure has to survive beside the status, never inside it.
  it("names a session that could not be read beside a tool that otherwise read fine", () => {
    const output = new CapturingOutput();

    printLocalCostReadReport(
      output,
      readResult({
        sessions: [{ sessionId: "s-1", toolReports: [] }],
        toolReports: [
          toolReport({
            status: "found",
            recordsFound: 3,
            recordsStored: 3,
            sessionsFailed: 1,
            failureReason: "EACCES",
          }),
        ],
      })
    );

    expect(textOf(output)).toContain("1 session could not be read");
    expect(textOf(output)).toContain("EACCES");
  });

  // A refusal read nothing and stored nothing. "No session journalled yet" is a fact about
  // the journal; conflating the two sends a person to look at the wrong thing.
  it("tells a refusal apart from an empty journal", () => {
    const refused = new CapturingOutput();
    printLocalCostReadReport(refused, readResult({ refusedReason: "measurement is off" }));

    const empty = new CapturingOutput();
    printLocalCostReadReport(empty, readResult());

    expect(textOf(refused)).toContain("measurement is off");
    expect(textOf(empty)).toContain("No session journalled yet");
    expect(textOf(refused)).not.toContain("No session journalled yet");
  });

  it("leads with how many sessions it covered, not one line per tool per session", () => {
    const output = new CapturingOutput();

    printLocalCostReadReport(
      output,
      readResult({
        sessions: [
          { sessionId: "s-1", toolReports: [] },
          { sessionId: "s-2", toolReports: [] },
        ],
        toolReports: [toolReport({ status: "found", recordsFound: 2, recordsStored: 2 })],
      })
    );

    expect(output.lines[0]).toContain("2 sessions read");
  });
});

describe("what the switch says when it is flipped", () => {
  it("says the file is tracked, because turning it on decides for everyone who clones", () => {
    const output = new CapturingOutput();

    printTelemetryOnReport(output, { switchPath: "/repo/.aidd/config.json", switchChanged: true });

    expect(textOf(output)).toContain("git-tracked");
  });

  it("tells an already-on project from one it just turned on", () => {
    const changed = new CapturingOutput();
    printTelemetryOnReport(changed, { switchPath: "/p/.aidd/config.json", switchChanged: true });
    const unchanged = new CapturingOutput();
    printTelemetryOnReport(unchanged, { switchPath: "/p/.aidd/config.json", switchChanged: false });

    expect(textOf(changed)).not.toContain("already on");
    expect(textOf(unchanged)).toContain("already on");
  });

  // Turning recording off is not erasing what was recorded, and a person who wanted the
  // second has to be told which command does it.
  it("says off stops new recording only, and names what removes the rest", () => {
    const output = new CapturingOutput();

    printTelemetryOffReport(output, { switchPath: "/p/.aidd/config.json", switchChanged: true });

    expect(textOf(output)).toContain("stops new recording only");
    expect(textOf(output)).toContain("aidd telemetry forget");
  });
});

describe("what the identity commands say", () => {
  it("says records carry no person when nobody has chosen", () => {
    const output = new CapturingOutput();

    printPersonIdentityStatus(output, { filePath: "/h/identity.json", identity: null });

    expect(textOf(output)).toContain("records carry no person");
  });

  it("tells an identifier minted here from one taken from another machine", () => {
    const minted = new CapturingOutput();
    printPersonIdentityStatus(minted, {
      filePath: "/h/identity.json",
      identity: { personId: "p-1", origin: "minted", alsoMe: [] },
    });
    const adopted = new CapturingOutput();
    printPersonIdentityStatus(adopted, {
      filePath: "/h/identity.json",
      identity: { personId: "p-1", origin: "adopted", alsoMe: [] },
    });

    expect(textOf(minted)).toContain("minted on this machine");
    expect(textOf(adopted)).toContain("taken from another machine");
  });

  // Taking a different identifier does not rewrite what is already stored, and a person
  // has to be told which identifier those records keep.
  it("names the identifier that was replaced, when one was", () => {
    const output = new CapturingOutput();

    printPersonIdentityUse(output, {
      filePath: "/h/identity.json",
      identity: { personId: "p-2", origin: "adopted", alsoMe: [] },
      outcome: "adopted",
      replacedPersonId: "p-1",
    });

    expect(textOf(output)).toContain("p-1");
  });

  it("says withdrawing takes the added identifiers with it", () => {
    const output = new CapturingOutput();

    printPersonIdentityOff(output, {
      filePath: "/h/identity.json",
      removed: true,
      discardedDamaged: false,
      addedIdentifiersRemoved: 2,
    });

    expect(textOf(output)).toMatch(/2/u);
  });
});

describe("the warning about where the figures land", () => {
  /** The real in-memory sink with only the field this printer reads — never an object literal
   * widened into the port, which would stop failing the day the port grows a member. */
  function sink(locatedBy: TelemetrySink["locatedBy"]): TelemetrySink {
    const built = new InMemoryTelemetrySink();
    built.locatedBy = locatedBy;
    return built;
  }

  // `AIDD_USER_CONFIG_DIR` names the directory that also holds `auth.json`. A person who
  // pointed it somewhere shared moved their GitHub token there too, and nothing else says so.
  it("warns when the figures were placed by the variable that also moves the token", () => {
    const output = new CapturingOutput();

    warnIfFiguresMoveTheTokenToo(output, sink("user-config-dir"));

    expect(textOf(output)).toContain("auth.json");
  });

  it("says nothing when the directory was named outright, or defaulted", () => {
    for (const locatedBy of ["telemetry-dir", "default"] as const) {
      const output = new CapturingOutput();
      warnIfFiguresMoveTheTokenToo(output, sink(locatedBy));
      expect(output.lines).toEqual([]);
    }
  });
});

describe("linking an identifier this person could not simply take as their own", () => {
  // `link` is a claim the tool cannot verify — it never checks who is running it — so every
  // path that writes one has to say so.
  it("says a fresh link is a declaration nothing here can check", () => {
    const output = new CapturingOutput();

    printPersonIdentityLink(output, {
      filePath: "/h/identity.json",
      personId: "p-1",
      identity: "machine-2",
      alreadyListed: false,
    });

    expect(textOf(output)).toContain("linked 'machine-2'");
    expect(textOf(output)).toContain("cannot check");
  });

  // Already listed is a no-op, not a second write, and a caller that links before reporting
  // has to be able to tell the two apart.
  it("reports one already listed as already listed, never as a fresh write", () => {
    const output = new CapturingOutput();

    printPersonIdentityLink(output, {
      filePath: "/h/identity.json",
      personId: "p-1",
      identity: "machine-2",
      alreadyListed: true,
    });

    expect(textOf(output)).toContain("already listed");
    expect(textOf(output)).not.toContain("linked 'machine-2'");
  });

  it("reports unlinking one nobody listed as nothing to remove, never a failure", () => {
    const output = new CapturingOutput();

    printPersonIdentityUnlink(output, {
      filePath: "/h/identity.json",
      identity: "machine-9",
      removed: false,
    });

    expect(textOf(output)).toContain("nothing to remove");
  });

  it("names the identifier it withdrew", () => {
    const output = new CapturingOutput();

    printPersonIdentityUnlink(output, {
      filePath: "/h/identity.json",
      identity: "machine-2",
      removed: true,
    });

    expect(textOf(output)).toContain("unlinked 'machine-2'");
  });
});

describe("what minting says it does, and does not do", () => {
  // The consent a person gives is to this sentence, so both halves of it are asserted.
  it("names what the identifier attaches to, and what it never attaches to", () => {
    const output = new CapturingOutput();

    printPersonIdentityUse(output, {
      filePath: "/h/identity.json",
      identity: { personId: "p-1", origin: "minted", alsoMe: [] },
      outcome: "minted",
    });

    expect(textOf(output)).toContain("records this machine reads locally");
    expect(textOf(output)).toContain("Never attaches to");
  });

  // "Already in effect" is true of the identifier and false of the file once a name came
  // with the call: something was written, and the first line must not say otherwise.
  it("does not claim nothing changed when a display name was set alongside", () => {
    const output = new CapturingOutput();

    printPersonIdentityUse(output, {
      filePath: "/h/identity.json",
      identity: { personId: "p-1", origin: "minted", alsoMe: [], displayName: "Ada" },
      outcome: "unchanged",
      displayNameSet: "Ada",
    });

    expect(textOf(output)).toContain("display name set");
    expect(textOf(output)).toContain("Ada");
  });

  it("says withdrawing never gives the same identifier back", () => {
    const output = new CapturingOutput();

    printPersonIdentityOff(output, {
      filePath: "/h/identity.json",
      removed: true,
      discardedDamaged: false,
      addedIdentifiersRemoved: 0,
    });

    expect(textOf(output)).toContain("mints a fresh identifier, never this one back");
  });

  it("reports nothing to withdraw when nobody had chosen", () => {
    const output = new CapturingOutput();

    printPersonIdentityOff(output, {
      filePath: "/h/identity.json",
      removed: false,
      discardedDamaged: false,
      addedIdentifiersRemoved: 0,
    });

    expect(textOf(output)).toContain("already off");
  });

  // Withdrawing has to work exactly when the file is too damaged to read, and say that it
  // discarded rather than read it.
  it("says a damaged file was discarded rather than left behind", () => {
    const output = new CapturingOutput();

    printPersonIdentityOff(output, {
      filePath: "/h/identity.json",
      removed: true,
      discardedDamaged: true,
      addedIdentifiersRemoved: 0,
    });

    expect(textOf(output)).toContain("discarded rather than left behind");
  });
});

const DISCLAIMER =
  "  This is a declaration the tool cannot check - it never verifies who is running it.";
const IDENTITY_FILE = "/h/identity.json";

function printed(print: (output: CapturingOutput) => void): string[] {
  const output = new CapturingOutput();
  print(output);
  return output.lines;
}

describe("printTelemetryOnReport", () => {
  it("names the switch file it wrote, then that everyone who clones gets it", () => {
    expect(
      printed((output) =>
        printTelemetryOnReport(output, {
          switchPath: "/repo/.aidd/config.json",
          switchChanged: true,
        })
      )
    ).toEqual([
      "AIDD telemetry: on (/repo/.aidd/config.json)",
      "/repo/.aidd/config.json is git-tracked — this applies to everyone who clones.",
    ]);
  });

  it("says already on where nothing was written", () => {
    expect(
      printed((output) =>
        printTelemetryOnReport(output, {
          switchPath: "/repo/.aidd/config.json",
          switchChanged: false,
        })
      )[0]
    ).toBe("AIDD telemetry: already on (/repo/.aidd/config.json)");
  });
});

describe("printTelemetryOffReport", () => {
  it("names what stops and what stays, and the command that removes the rest", () => {
    expect(
      printed((output) =>
        printTelemetryOffReport(output, {
          switchPath: "/p/.aidd/config.json",
          switchChanged: true,
        })
      )
    ).toEqual([
      "AIDD telemetry: off (/p/.aidd/config.json)",
      "This stops new recording only — sessions already journalled stay in aidd_docs/runs/ " +
        "and whatever `aidd telemetry read` already stored, and `aidd telemetry report` still " +
        "reports them. Run `aidd telemetry forget` to remove what was already measured.",
    ]);
  });

  it("says already off where nothing was written", () => {
    expect(
      printed((output) =>
        printTelemetryOffReport(output, {
          switchPath: "/p/.aidd/config.json",
          switchChanged: false,
        })
      )[0]
    ).toBe("AIDD telemetry: already off (/p/.aidd/config.json)");
  });
});

describe("printLocalCostReadReport — the line each tool gets", () => {
  function toolLine(overrides: Partial<LocalCostToolReport>): string {
    return printed((output) =>
      printLocalCostReadReport(
        output,
        readResult({
          sessions: [{ sessionId: "s-1", toolReports: [] }],
          toolReports: [toolReport(overrides)],
        })
      )
    )[1] as string;
  }

  it("counts what was stored against what was found, on a tool that read something", () => {
    expect(toolLine({ status: "found", recordsFound: 5, recordsStored: 3 })).toBe(
      "  Claude Code: read (3 new of 5)"
    );
  });

  it("counts nothing on a status other than found, whose counts would mean nothing", () => {
    expect(toolLine({ status: "empty", recordsFound: 5, recordsStored: 3 })).toBe(
      "  Claude Code: read, nothing found"
    );
  });

  it("gives each status its own words, none of them readable as another", () => {
    expect([
      toolLine({ status: "not-found" }),
      toolLine({ status: "unreadable" }),
      toolLine({ status: "not-covered" }),
      toolLine({ status: "not-asked" }),
    ]).toEqual([
      "  Claude Code: no session found",
      "  Claude Code: could not be read",
      "  Claude Code: not covered",
      "  Claude Code: no session read belongs to it",
    ]);
  });

  it("carries a reason after the status, and a failed-session count after that", () => {
    expect(
      toolLine({
        status: "found",
        recordsFound: 5,
        recordsStored: 3,
        reason: "one transcript was truncated",
        sessionsFailed: 2,
        failureReason: "EACCES",
      })
    ).toBe(
      "  Claude Code: read (3 new of 5) — one transcript was truncated " +
        "[2 sessions could not be read: EACCES]"
    );
  });

  it("counts one failed session in the singular", () => {
    expect(toolLine({ status: "found", sessionsFailed: 1, failureReason: "EACCES" })).toBe(
      "  Claude Code: read (0 new of 0) [1 session could not be read: EACCES]"
    );
  });
});

describe("printLocalCostReadReport — the line the sweep leads with", () => {
  it("counts the sessions it read and how many of them yielded a record", () => {
    expect(
      printed((output) =>
        printLocalCostReadReport(
          output,
          readResult({
            sessions: [
              { sessionId: "s-1", toolReports: [toolReport({ recordsFound: 2 })] },
              { sessionId: "s-2", toolReports: [toolReport({ recordsFound: 0 })] },
            ],
            toolReports: [],
          })
        )
      )
    ).toEqual(["  2 sessions read, 1 with records"]);
  });

  it("counts every session that yielded a record, not the ones that yielded none", () => {
    expect(
      printed((output) =>
        printLocalCostReadReport(
          output,
          readResult({
            sessions: [
              { sessionId: "s-1", toolReports: [toolReport({ recordsFound: 2 })] },
              { sessionId: "s-2", toolReports: [toolReport({ recordsFound: 4 })] },
            ],
            toolReports: [],
          })
        )
      )
    ).toEqual(["  2 sessions read, 2 with records"]);
  });

  it("counts one session in the singular", () => {
    expect(
      printed((output) =>
        printLocalCostReadReport(
          output,
          readResult({ sessions: [{ sessionId: "s-1", toolReports: [] }], toolReports: [] })
        )
      )
    ).toEqual(["  1 session read, 0 with records"]);
  });

  it("says nothing was journalled rather than that nothing was read", () => {
    expect(printed((output) => printLocalCostReadReport(output, readResult()))).toEqual([
      "  No session journalled yet — nothing to read.",
    ]);
  });

  it("prints a refusal alone, never the journal's own count beside it", () => {
    expect(
      printed((output) =>
        printLocalCostReadReport(
          output,
          readResult({
            refusedReason: "measurement is off for this project",
            sessions: [{ sessionId: "s-1", toolReports: [] }],
            toolReports: [toolReport({})],
          })
        )
      )
    ).toEqual(["  measurement is off for this project"]);
  });
});

describe("printPersonIdentityStatus", () => {
  it("says off, in the words the switch beside it never uses", () => {
    expect(
      printed((output) =>
        printPersonIdentityStatus(output, { filePath: IDENTITY_FILE, identity: null })
      )
    ).toEqual(["AIDD identity: off - records carry no person"]);
  });

  it("names the identifier, where it came from and the file holding it", () => {
    expect(
      printed((output) =>
        printPersonIdentityStatus(output, {
          filePath: IDENTITY_FILE,
          identity: { personId: "p-1", origin: "minted", alsoMe: [] },
        })
      )
    ).toEqual([`AIDD identity: on, p-1 (minted on this machine) (${IDENTITY_FILE})`]);
  });

  it("quotes a display name between the origin and the file, and lists the added identifiers", () => {
    expect(
      printed((output) =>
        printPersonIdentityStatus(output, {
          filePath: IDENTITY_FILE,
          identity: {
            personId: "p-1",
            origin: "adopted",
            alsoMe: ["machine-1", "machine-2"],
            displayName: "Ada",
          },
        })
      )
    ).toEqual([
      `AIDD identity: on, p-1 (taken from another machine), display name "Ada" (${IDENTITY_FILE})`,
      "  Identifiers added onto this person: machine-1, machine-2",
    ]);
  });
});

describe("printPersonIdentityUse", () => {
  it("discloses what a minted identifier attaches to, and what it never attaches to", () => {
    expect(
      printed((output) =>
        printPersonIdentityUse(output, {
          filePath: IDENTITY_FILE,
          identity: { personId: "p-1", origin: "minted", alsoMe: [] },
          outcome: "minted",
        })
      )
    ).toEqual([
      `AIDD identity: on, p-1 (${IDENTITY_FILE})`,
      "  Attaches to: records this machine reads locally, from now on.",
      "  Never attaches to: the run journal, a session already recorded, or a tool's own export.",
    ]);
  });

  it("names what an adopted identifier replaced, and what the old records keep", () => {
    expect(
      printed((output) =>
        printPersonIdentityUse(output, {
          filePath: IDENTITY_FILE,
          identity: { personId: "p-2", origin: "adopted", alsoMe: [] },
          outcome: "adopted",
          replacedPersonId: "p-1",
        })
      )
    ).toEqual([
      `AIDD identity: now p-2 (replacing p-1) (${IDENTITY_FILE})`,
      "  Records already written keep the identifier they were written with.",
      DISCLAIMER,
    ]);
  });

  it("says nothing about replacing when the identifier taken was nobody's before", () => {
    expect(
      printed((output) =>
        printPersonIdentityUse(output, {
          filePath: IDENTITY_FILE,
          identity: { personId: "p-2", origin: "adopted", alsoMe: [] },
          outcome: "adopted",
        })
      )
    ).toEqual([`AIDD identity: now p-2 (${IDENTITY_FILE})`, DISCLAIMER]);
  });

  it("claims nothing was written for an unchanged identifier with no name alongside", () => {
    expect(
      printed((output) =>
        printPersonIdentityUse(output, {
          filePath: IDENTITY_FILE,
          identity: { personId: "p-1", origin: "minted", alsoMe: [] },
          outcome: "unchanged",
        })
      )
    ).toEqual([`AIDD identity: p-1 already in effect (${IDENTITY_FILE})`]);
  });

  it("says a display name was set on the same line, then prints it", () => {
    expect(
      printed((output) =>
        printPersonIdentityUse(output, {
          filePath: IDENTITY_FILE,
          identity: { personId: "p-1", origin: "minted", alsoMe: [], displayName: "Ada" },
          outcome: "unchanged",
          displayNameSet: "Ada",
        })
      )
    ).toEqual([
      `AIDD identity: p-1 already in effect, display name set (${IDENTITY_FILE})`,
      "  Display name: Ada",
    ]);
  });
});

describe("printPersonIdentityOff", () => {
  it("says already off without claiming a file was removed", () => {
    expect(
      printed((output) =>
        printPersonIdentityOff(output, {
          filePath: IDENTITY_FILE,
          removed: false,
          discardedDamaged: false,
          addedIdentifiersRemoved: 0,
        })
      )
    ).toEqual(["AIDD identity: already off - nothing to withdraw"]);
  });

  it("names the file, what stays, that opting in again mints afresh, and the count removed", () => {
    expect(
      printed((output) =>
        printPersonIdentityOff(output, {
          filePath: IDENTITY_FILE,
          removed: true,
          discardedDamaged: false,
          addedIdentifiersRemoved: 2,
        })
      )
    ).toEqual([
      `AIDD identity: off (${IDENTITY_FILE} removed)`,
      "  New records carry no person, from now on.",
      "  Records already stored keep the identifier they were written with - none are changed.",
      "  Opting in again later mints a fresh identifier, never this one back.",
      "  2 added identifiers removed with it.",
    ]);
  });

  it("says a damaged file was discarded rather than read, and counts one in the singular", () => {
    expect(
      printed((output) =>
        printPersonIdentityOff(output, {
          filePath: IDENTITY_FILE,
          removed: true,
          discardedDamaged: true,
          addedIdentifiersRemoved: 1,
        })
      ).filter((line) => line.includes("discarded") || line.includes("added identifier"))
    ).toEqual([
      "  The identity file could not be read, so it was discarded rather than left behind.",
      "  1 added identifier removed with it.",
    ]);
  });
});

describe("printPersonIdentityLink and printPersonIdentityUnlink", () => {
  it("names the identifier, the person it joined and the file, then the disclaimer", () => {
    expect(
      printed((output) =>
        printPersonIdentityLink(output, {
          filePath: IDENTITY_FILE,
          personId: "p-1",
          identity: "machine-2",
          alreadyListed: false,
        })
      )
    ).toEqual([`AIDD identity: linked 'machine-2' to p-1 (${IDENTITY_FILE})`, DISCLAIMER]);
  });

  it("says an identifier already listed is already listed, and adds no disclaimer", () => {
    expect(
      printed((output) =>
        printPersonIdentityLink(output, {
          filePath: IDENTITY_FILE,
          personId: "p-1",
          identity: "machine-2",
          alreadyListed: true,
        })
      )
    ).toEqual([`AIDD identity: 'machine-2' is already listed under p-1 (${IDENTITY_FILE})`]);
  });

  it("names the identifier it withdrew, with the file it left", () => {
    expect(
      printed((output) =>
        printPersonIdentityUnlink(output, {
          filePath: IDENTITY_FILE,
          identity: "machine-2",
          removed: true,
        })
      )
    ).toEqual([`AIDD identity: unlinked 'machine-2' (${IDENTITY_FILE})`]);
  });

  it("says one nobody listed was never listed, never that removal failed", () => {
    expect(
      printed((output) =>
        printPersonIdentityUnlink(output, {
          filePath: IDENTITY_FILE,
          identity: "machine-9",
          removed: false,
        })
      )
    ).toEqual(["AIDD identity: 'machine-9' was not listed - nothing to remove"]);
  });
});

describe("warnIfFiguresMoveTheTokenToo", () => {
  it("names the directory, the variable and the token it also moves, on stderr", () => {
    const output = new CapturingOutput();
    const sink = new InMemoryTelemetrySink();
    sink.locatedBy = "user-config-dir";

    warnIfFiguresMoveTheTokenToo(output, sink);

    expect(output.at("warn")).toEqual([
      "Figures are kept at /fake/telemetry, located through AIDD_USER_CONFIG_DIR — which also " +
        "moves auth.json, this machine's GitHub token. If that directory is shared, the token " +
        "is in it. Set AIDD_TELEMETRY_DIR to the same path instead: it moves the figures and " +
        "nothing else.",
    ]);
  });
});
