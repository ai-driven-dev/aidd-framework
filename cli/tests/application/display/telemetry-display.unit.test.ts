import { describe, expect, it } from "vitest";
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
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
} from "../../../src/application/display/telemetry-display.js";
import { CLIOutput } from "../../../src/application/output.js";
import type {
  LocalCostToolReport,
  LocalCostToolStatus,
  ReadLocalCostResult,
} from "../../../src/application/use-cases/telemetry/read-local-cost-use-case.js";
import type { TelemetrySink } from "../../../src/domain/ports/telemetry-sink.js";
import { InMemoryTelemetrySink } from "../../helpers/ports/in-memory-telemetry-sink.js";

/** Extends the real output rather than standing in for it — the same reasoning
 * `cost-report-display.unit.test.ts` gives: a widened double stops failing the day the
 * class grows a method the printer starts calling. */
class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
  override info(message: string): void {
    this.lines.push(message);
  }
  override success(message: string): void {
    this.lines.push(message);
  }
  override warn(message: string): void {
    this.lines.push(message);
  }

  get text(): string {
    return this.lines.join("\n");
  }
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
  /**
   * The six statuses are the "an unknown is never a zero" rule in printed form: five of
   * them mean something different from "this tool billed nothing", and any two sharing a
   * label would let a session that was never measured read as free. So the labels are held
   * apart from each other, not matched one by one against a wording that may change.
   */
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

    expect(output.text).not.toMatch(/nothing found/u);
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

    expect(output.text).toContain("1 session could not be read");
    expect(output.text).toContain("EACCES");
  });

  // A refusal read nothing and stored nothing. "No session journalled yet" is a fact about
  // the journal; conflating the two sends a person to look at the wrong thing.
  it("tells a refusal apart from an empty journal", () => {
    const refused = new CapturingOutput();
    printLocalCostReadReport(refused, readResult({ refusedReason: "measurement is off" }));

    const empty = new CapturingOutput();
    printLocalCostReadReport(empty, readResult());

    expect(refused.text).toContain("measurement is off");
    expect(empty.text).toContain("No session journalled yet");
    expect(refused.text).not.toContain("No session journalled yet");
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

    expect(output.text).toContain("git-tracked");
  });

  it("tells an already-on project from one it just turned on", () => {
    const changed = new CapturingOutput();
    printTelemetryOnReport(changed, { switchPath: "/p/.aidd/config.json", switchChanged: true });
    const unchanged = new CapturingOutput();
    printTelemetryOnReport(unchanged, { switchPath: "/p/.aidd/config.json", switchChanged: false });

    expect(changed.text).not.toContain("already on");
    expect(unchanged.text).toContain("already on");
  });

  // Turning recording off is not erasing what was recorded, and a person who wanted the
  // second has to be told which command does it.
  it("says off stops new recording only, and names what removes the rest", () => {
    const output = new CapturingOutput();

    printTelemetryOffReport(output, { switchPath: "/p/.aidd/config.json", switchChanged: true });

    expect(output.text).toContain("stops new recording only");
    expect(output.text).toContain("aidd telemetry forget");
  });
});

describe("what the identity commands say", () => {
  it("says records carry no person when nobody has chosen", () => {
    const output = new CapturingOutput();

    printPersonIdentityStatus(output, { filePath: "/h/identity.json", identity: null });

    expect(output.text).toContain("records carry no person");
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

    expect(minted.text).toContain("minted on this machine");
    expect(adopted.text).toContain("taken from another machine");
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

    expect(output.text).toContain("p-1");
  });

  it("says withdrawing takes the added identifiers with it", () => {
    const output = new CapturingOutput();

    printPersonIdentityOff(output, {
      filePath: "/h/identity.json",
      removed: true,
      discardedDamaged: false,
      addedIdentifiersRemoved: 2,
    });

    expect(output.text).toMatch(/2/u);
  });
});

describe("the warning about where the figures land", () => {
  /** The real in-memory sink, with only the one field this printer reads set — never an
   * object literal widened into the port, which `check-cli-layering.mjs` refuses and which
   * would stop failing the day the port grows a member. */
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

    expect(output.text).toContain("auth.json");
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

    expect(output.text).toContain("linked 'machine-2'");
    expect(output.text).toContain("cannot check");
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

    expect(output.text).toContain("already listed");
    expect(output.text).not.toContain("linked 'machine-2'");
  });

  it("reports unlinking one nobody listed as nothing to remove, never a failure", () => {
    const output = new CapturingOutput();

    printPersonIdentityUnlink(output, {
      filePath: "/h/identity.json",
      identity: "machine-9",
      removed: false,
    });

    expect(output.text).toContain("nothing to remove");
  });

  it("names the identifier it withdrew", () => {
    const output = new CapturingOutput();

    printPersonIdentityUnlink(output, {
      filePath: "/h/identity.json",
      identity: "machine-2",
      removed: true,
    });

    expect(output.text).toContain("unlinked 'machine-2'");
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

    expect(output.text).toContain("records this machine reads locally");
    expect(output.text).toContain("Never attaches to");
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

    expect(output.text).toContain("display name set");
    expect(output.text).toContain("Ada");
  });

  it("says withdrawing never gives the same identifier back", () => {
    const output = new CapturingOutput();

    printPersonIdentityOff(output, {
      filePath: "/h/identity.json",
      removed: true,
      discardedDamaged: false,
      addedIdentifiersRemoved: 0,
    });

    expect(output.text).toContain("mints a fresh identifier, never this one back");
  });

  it("reports nothing to withdraw when nobody had chosen", () => {
    const output = new CapturingOutput();

    printPersonIdentityOff(output, {
      filePath: "/h/identity.json",
      removed: false,
      discardedDamaged: false,
      addedIdentifiersRemoved: 0,
    });

    expect(output.text).toContain("already off");
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

    expect(output.text).toContain("discarded rather than left behind");
  });
});
