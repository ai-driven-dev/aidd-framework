import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { buildCostReport } from "../../../src/contexts/telemetry/domain/cost-report.js";
import { DEFAULT_REPORT_DAYS } from "../../../src/contexts/telemetry/domain/report-period.js";
import type { TelemetryRemovalPreview } from "../../../src/contexts/telemetry/domain/telemetry-removal.js";
import { ARTEFACT_AXES } from "../../../src/presentation/display/cost-report-artefact.js";

const telemetryOn = vi.fn();
const telemetryOff = vi.fn();
const readLocalCost = vi.fn();
const reportCost = vi.fn();
const diagnose = vi.fn();
const forgetPreview = vi.fn();
const forgetRemove = vi.fn();
const identityStatus = vi.fn();
const identityUse = vi.fn();
const identityOff = vi.fn();
const identityLink = vi.fn();
const identityUnlink = vi.fn();

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    telemetryOnUseCase: { execute: telemetryOn },
    telemetryOffUseCase: { execute: telemetryOff },
    readLocalCostUseCase: { execute: readLocalCost },
    reportCostUseCase: { execute: reportCost },
    diagnoseTelemetryUseCase: { execute: diagnose },
    forgetTelemetryUseCase: { preview: forgetPreview, remove: forgetRemove },
    personIdentityUseCase: {
      status: identityStatus,
      use: identityUse,
      off: identityOff,
      link: identityLink,
      unlink: identityUnlink,
    },
    telemetrySink: { locatedBy: "default", rootDir: "/records" },
  })),
  createMenuDeps: vi.fn(),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerTelemetryCommand } = await import(
  "../../../src/presentation/commands/telemetry.js"
);

const PROJECT_ROOT = process.cwd();

function emptyReport() {
  return buildCostReport({
    fromDay: "2026-08-17",
    toDay: "2026-08-17",
    records: [],
    journals: [],
    declaredTools: [
      {
        tool: "claude",
        coverage: "covered",
        capability: {
          localRead: null,
          export: null,
          journalAttributable: false,
          taskAttributable: false,
        },
      },
    ],
    undatedRecords: 0,
    unreadableLines: 0,
    measurementEnabled: true,
  });
}

const NOTHING_TO_REMOVE: TelemetryRemovalPreview = {
  journal: { scope: "project", path: "/repo/aidd_docs/runs", runFileNames: [] },
  sink: { scope: "machine", path: "/records", dayFileNames: [] },
  identity: { scope: "machine", path: "/h/identity.json", present: false, unreadable: false },
  history: { certainty: "none" },
};

const ONE_RUN_FILE: TelemetryRemovalPreview = {
  ...NOTHING_TO_REMOVE,
  journal: { scope: "project", path: "/repo/aidd_docs/runs", runFileNames: ["a.jsonl"] },
};

let written: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  written = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  telemetryOn.mockResolvedValue({ switchPath: "/repo/.aidd/config.json", switchChanged: true });
  telemetryOff.mockResolvedValue({ switchPath: "/repo/.aidd/config.json", switchChanged: true });
  readLocalCost.mockResolvedValue({ sessions: [], toolReports: [] });
  reportCost.mockResolvedValue(emptyReport());
  diagnose.mockResolvedValue({
    gate: "measurement is off",
    setup: checkSetup(),
    leftoverExportConfig: [],
  });
  forgetPreview.mockResolvedValue(NOTHING_TO_REMOVE);
  forgetRemove.mockResolvedValue({
    journal: { removed: 0, failed: [] },
    sink: { removed: 0, failed: [] },
    identity: { removed: 0, failed: [] },
    history: { certainty: "none" },
  });
  identityStatus.mockResolvedValue({ filePath: "/h/identity.json", identity: null });
  identityUse.mockResolvedValue({
    filePath: "/h/identity.json",
    identity: { personId: "p-1", origin: "minted", alsoMe: [] },
    outcome: "minted",
  });
  identityOff.mockResolvedValue({
    filePath: "/h/identity.json",
    removed: false,
    discardedDamaged: false,
    addedIdentifiersRemoved: 0,
  });
  identityLink.mockResolvedValue({
    filePath: "/h/identity.json",
    personId: "p-1",
    identity: "machine-2",
    alreadyListed: true,
  });
  identityUnlink.mockResolvedValue({
    filePath: "/h/identity.json",
    identity: "machine-2",
    removed: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function checkSetup() {
  return {
    allowed: {
      allowed: true,
      readable: true,
      location: "/repo/.aidd/config.json",
      decidedBy: "project-switch",
    },
    identity: { attached: false, path: "/h/identity.json", readable: true },
    recordsLocation: { path: "/records" },
    hostRegistration: { entries: [] },
    commitTrailer: {
      delegate: "executable",
      callSite: "present",
      hookHasOtherContent: false,
      hooksDir: "/repo/.git/hooks",
    },
    recorderDeclaration: {
      declared: true,
      declaredAt: ["/repo/.aidd/manifest.json"],
      locationsChecked: ["/repo/.aidd/manifest.json"],
      unreadable: [],
    },
    versions: { cli: "5.2.2", plugin: { kind: "nothing-journalled" } },
  } as const;
}

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  registerTelemetryCommand(program);
  await program.parseAsync(["node", "aidd", "telemetry", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd telemetry on | off", () => {
  it("passes the flag a person confirmed with, and prints what the switch became", async () => {
    expect(await run("on", "--yes")).toEqual([
      "AIDD telemetry: on (/repo/.aidd/config.json)",
      "/repo/.aidd/config.json is git-tracked — this applies to everyone who clones.",
    ]);
    expect(telemetryOn).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT, confirmed: true });
  });

  it("passes an unconfirmed run as unconfirmed, never as absent", async () => {
    await run("on");

    expect(telemetryOn).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT, confirmed: false });
  });

  it("asks off for nothing but the project, and prints what stays behind", async () => {
    const lines = await run("off");

    expect(telemetryOff).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT });
    expect(lines[0]).toBe("AIDD telemetry: off (/repo/.aidd/config.json)");
  });
});

describe("aidd telemetry read", () => {
  it("sweeps every journalled session when none was named", async () => {
    const lines = await run("read");

    expect(Object.keys(readLocalCost.mock.calls[0][0]).sort()).toEqual(["env", "projectRoot"]);
    expect(lines).toEqual(["  No session journalled yet — nothing to read."]);
  });

  it("narrows to the one session a person named", async () => {
    await run("read", "--session", "s-1");

    expect(readLocalCost).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      env: process.env,
      sessionId: "s-1",
    });
  });
});

describe("aidd telemetry report — what it asks for", () => {
  it("resolves the period from the days given, and carries no filter nobody gave", async () => {
    await run("report", "--from", "2026-08-17", "--to", "2026-08-19");

    const asked = reportCost.mock.calls[0][0];
    expect(asked.period).toEqual({ fromDay: "2026-08-17", toDay: "2026-08-19" });
    expect(Object.keys(asked).sort()).toEqual(["env", "filters", "period", "projectRoot"]);
    expect(Object.keys(asked.filters)).toEqual([]);
  });

  it("carries the task and every filter a person named, each under its own key", async () => {
    await run(
      "report",
      "--from",
      "2026-08-17",
      "--to",
      "2026-08-19",
      "--task",
      "2026_08/x",
      "--project",
      "acme/widgets",
      "--step",
      "aidd-dev:02-implement",
      "--model",
      "opus",
      "--tool",
      "claude"
    );

    expect(reportCost).toHaveBeenCalledWith({
      period: { fromDay: "2026-08-17", toDay: "2026-08-19" },
      projectRoot: PROJECT_ROOT,
      env: process.env,
      task: "2026_08/x",
      filters: {
        project: "acme/widgets",
        step: "aidd-dev:02-implement",
        model: "opus",
        tool: "claude",
      },
    });
  });

  it("counts back from the last day when a span, not a first day, was given", async () => {
    await run("report", "--to", "2026-08-19", "--days", "3");

    expect(reportCost).toHaveBeenCalledWith(
      expect.objectContaining({ period: { fromDay: "2026-08-17", toDay: "2026-08-19" } })
    );
  });
});

describe("aidd telemetry report — the rendering it picks", () => {
  const PERIOD = ["--from", "2026-08-17", "--to", "2026-08-17"];

  it("prints the terminal rendering when neither shape was asked for", async () => {
    expect(await run("report", ...PERIOD)).toEqual([
      "period    2026-08-17 to 2026-08-17",
      "",
      "  sessions                  nothing in this period",
      "  requests                  nothing in this period",
      "",
      "  by tool",
      "    Claude Code               nothing in this period",
      "",
      "  by day",
      "    2026-08-17                nothing in this period",
    ]);
  });

  it("prints one parseable object, and nothing else, for --json", async () => {
    const lines = await run("report", ...PERIOD, "--json");

    expect(JSON.parse(lines.join("\n"))).toMatchObject({
      period: { from_day: "2026-08-17", to_day: "2026-08-17" },
    });
  });

  it("prints the one axis asked for as a table, never the whole report", async () => {
    expect(await run("report", ...PERIOD, "--axis", "total")).toEqual([
      "period 2026-08-17 to 2026-08-17 — axis: total",
      "",
      "nothing in this period",
    ]);
  });

  it("prefers the object over the table when both were asked for", async () => {
    const lines = await run("report", ...PERIOD, "--json", "--axis", "total");

    expect(() => JSON.parse(lines.join("\n"))).not.toThrow();
  });
});

describe("aidd telemetry check", () => {
  it("asks for this project and its environment, then prints the report", async () => {
    const lines = await run("check");

    expect(diagnose).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT, env: process.env });
    expect(lines.at(-1)).toBe("  measurement is off");
  });

  // A gated run judged nothing, so it can find nothing wanting: failing the process there
  // would report a project that switched measurement off as broken.
  it("leaves the exit code alone when the run was gated before judging", async () => {
    diagnose.mockResolvedValue({
      gate: "measurement is off",
      setup: checkSetup(),
      claims: [{ claim: "hook-fired", verdict: "fail", reason: "none", detail: "none" }],
      leftoverExportConfig: [],
    });

    await run("check");

    expect(process.exitCode).toBeUndefined();
  });

  it("fails the process on one claim found wanting among claims that held", async () => {
    diagnose.mockResolvedValue({
      setup: checkSetup(),
      claims: [
        { claim: "hook-fired", verdict: "ok", reason: "session-anchored", detail: "1 run file" },
        {
          claim: "records-join",
          verdict: "fail",
          reason: "all-unattributed",
          detail: "none",
        },
      ],
      uncovered: [],
      leftoverExportConfig: [],
    });

    await run("check");

    expect(process.exitCode).toBe(1);
  });

  it("leaves the exit code alone when every judged claim held", async () => {
    diagnose.mockResolvedValue({
      setup: checkSetup(),
      claims: [{ claim: "hook-fired", verdict: "ok", reason: "fired", detail: "1 run file(s)" }],
      uncovered: [],
      leftoverExportConfig: [],
    });

    await run("check");

    expect(process.exitCode).toBeUndefined();
  });
});

describe("aidd telemetry forget", () => {
  it("shows the preview and removes nothing when there was never anything to remove", async () => {
    const lines = await run("forget", "--yes");

    expect(forgetPreview).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT });
    expect(forgetRemove).not.toHaveBeenCalled();
    expect(lines[0]).toContain("nothing was ever measured here");
  });

  it("refuses without the flag, after showing exactly what would go", async () => {
    forgetPreview.mockResolvedValue(ONE_RUN_FILE);

    const lines = await run("forget");

    expect(forgetRemove).not.toHaveBeenCalled();
    expect(lines[0]).toBe("This would remove:");
    expect(lines.at(-1)).toBe(
      "Nothing removed. Pass --yes to remove exactly what is listed above."
    );
  });

  it("removes exactly the preview it showed, once the flag confirms it", async () => {
    forgetPreview.mockResolvedValue(ONE_RUN_FILE);

    const lines = await run("forget", "--yes");

    expect(forgetRemove).toHaveBeenCalledWith(ONE_RUN_FILE);
    expect(lines).toContain("AIDD telemetry: removed");
  });
});

describe("aidd telemetry identity", () => {
  it("answers the bare noun with the state, never a help screen", async () => {
    const lines = await run("identity");

    expect(identityStatus).toHaveBeenCalledWith();
    expect(lines).toEqual(["AIDD identity: off - records carry no person"]);
  });

  it("mints without an identifier or a name when neither was given", async () => {
    await run("identity", "use");

    expect(Object.keys(identityUse.mock.calls[0][0])).toEqual([]);
  });

  it("takes the identifier given, alone", async () => {
    await run("identity", "use", "p-9");

    expect(Object.keys(identityUse.mock.calls[0][0])).toEqual(["identifier"]);
    expect(identityUse).toHaveBeenCalledWith({ identifier: "p-9" });
  });

  it("attaches a display name to whichever identifier the call settles on", async () => {
    await run("identity", "use", "--name", "Ada");

    expect(Object.keys(identityUse.mock.calls[0][0])).toEqual(["displayName"]);
    expect(identityUse).toHaveBeenCalledWith({ displayName: "Ada" });
  });

  it("carries both an identifier and a name when both were given", async () => {
    await run("identity", "use", "p-9", "--name", "Ada");

    expect(identityUse).toHaveBeenCalledWith({ identifier: "p-9", displayName: "Ada" });
  });

  it("opts out with no argument at all", async () => {
    const lines = await run("identity", "off");

    expect(identityOff).toHaveBeenCalledWith();
    expect(lines).toEqual(["AIDD identity: already off - nothing to withdraw"]);
  });

  it("links and unlinks the identifier named on the command line", async () => {
    await run("identity", "link", "machine-2");
    await run("identity", "unlink", "machine-2");

    expect(identityLink).toHaveBeenCalledWith("machine-2");
    expect(identityUnlink).toHaveBeenCalledWith("machine-2");
  });
});

describe("aidd telemetry — a use case that throws", () => {
  it.each([
    [["on"], telemetryOn],
    [["off"], telemetryOff],
    [["read"], readLocalCost],
    [["report", "--from", "2026-08-17", "--to", "2026-08-17"], reportCost],
    [["check"], diagnose],
    [["forget"], forgetPreview],
    [["identity"], identityStatus],
    [["identity", "use"], identityUse],
    [["identity", "off"], identityOff],
    [["identity", "link", "m-2"], identityLink],
    [["identity", "unlink", "m-2"], identityUnlink],
  ])("names the failure of %j on stderr and fails the process", async (args, useCase) => {
    useCase.mockRejectedValue(new Error("boom"));
    const errors: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      errors.push(String(chunk));
      return true;
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run(...args)).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: boom\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd telemetry — the help surface", () => {
  function telemetryCommand(): Command {
    const program = new Command();
    registerTelemetryCommand(program);
    const telemetry = program.commands.find((command) => command.name() === "telemetry");
    if (telemetry === undefined) throw new Error("telemetry command was not registered");
    return telemetry;
  }

  function describedCommands(parent: Command): [string, string][] {
    return parent.commands.flatMap((command): [string, string][] => [
      [command.name(), command.description()],
      ...describedCommands(command),
    ]);
  }

  function optionsOf(path: readonly string[]): [string, string][] {
    let command = telemetryCommand();
    for (const name of path) {
      const child = command.commands.find((candidate) => candidate.name() === name);
      if (child === undefined) throw new Error(`no subcommand ${name}`);
      command = child;
    }
    return command.options.map((option) => [option.flags, option.description]);
  }

  it("describes the group by what a person decides with it", () => {
    expect(telemetryCommand().description()).toBe("Control whether AIDD may measure this project");
  });

  it("describes every subcommand, in the order they are registered", () => {
    expect(describedCommands(telemetryCommand())).toEqual([
      ["on", "Turn on the AIDD telemetry switch and git-ignore the run journal"],
      [
        "read",
        "Read what sessions cost from the files their tools already wrote, with no process running",
      ],
      ["identity", "Whether this person's own identifier is attached to records read locally"],
      [
        "use",
        "Mint this person's identifier, or take one minted on another machine. --name attaches a display name",
      ],
      ["off", "Opt out: new records carry no person, from now on"],
      [
        "link",
        "Add an identifier this person cannot choose onto this same person - one row, not two, in a report",
      ],
      ["unlink", "Withdraw an added identifier from this person"],
      ["check", "Check whether the measurement chain is actually recording for this project"],
      [
        "report",
        "Report what a period, or one task inside it, cost — tokens, models and steps, with how strongly each was attributed",
      ],
      [
        "off",
        "Turn off the AIDD telemetry switch, warning if a tool's own settings file still exports",
      ],
      [
        "forget",
        "Irreversibly remove what this tool measured: this project's run journal, this " +
          "machine's stored records, and this machine's identity file",
      ],
    ]);
  });

  it("says what confirming on and confirming forget each mean", () => {
    expect(optionsOf(["on"])).toEqual([
      [
        "--yes",
        "Confirm writing the git-tracked switch — this turns measurement on for everyone who clones",
      ],
    ]);
    expect(optionsOf(["forget"])).toEqual([
      ["--yes", "Confirm removal after seeing what would go — without it, nothing is removed"],
    ]);
  });

  it("says what omitting read's own session means", () => {
    expect(optionsOf(["read"])).toEqual([
      [
        "--session <id>",
        "One session to read. Omitted, every session the run journal knows is read",
      ],
    ]);
  });

  it("names every day, filter and shape report accepts, and every axis by name", () => {
    expect(optionsOf(["report"])).toEqual([
      ["--from <day>", "First UTC day to report, as YYYY-MM-DD"],
      ["--to <day>", "Last UTC day to report, as YYYY-MM-DD (default today)"],
      [
        "--days <n>",
        `How many days back to report, ending at --to (default ${DEFAULT_REPORT_DAYS})`,
      ],
      [
        "--task <identity>",
        "Restrict to the sessions that wrote into this task, as <yyyy_mm>/<name>",
      ],
      ["--project <id>", "Restrict to this project"],
      ["--step <name>", "Restrict to this step"],
      ["--model <name>", "Restrict to this model"],
      ["--tool <id>", "Restrict to this tool"],
      [
        "--axis <axis>",
        `Print one axis as a table to paste elsewhere: ${ARTEFACT_AXES.join(" | ")}`,
      ],
      ["--json", "Print one object a program can parse, instead of text for a person"],
    ]);
  });

  it("names the display name identity use attaches, and asks nothing else anywhere", () => {
    expect(optionsOf(["identity", "use"])).toEqual([
      ["--name <value>", "A display name for whichever identifier this call settles on"],
    ]);
    expect(optionsOf(["identity"])).toEqual([]);
    expect(optionsOf(["check"])).toEqual([]);
  });
});

describe("aidd telemetry — how every subcommand builds its graph", () => {
  it.each([
    ["on"],
    ["off"],
    ["read"],
    ["report", "--from", "2026-08-17", "--to", "2026-08-17"],
    ["check"],
    ["forget"],
    ["identity"],
    ["identity", "use"],
    ["identity", "off"],
    ["identity", "link", "m-2"],
    ["identity", "unlink", "m-2"],
  ])("hands %j's own graph this run's verbosity, never an empty option set", async (...args) => {
    await run(...args);

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: false },
      expect.anything()
    );
  });
});
