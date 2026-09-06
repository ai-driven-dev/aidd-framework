import { describe, expect, it } from "vitest";
import type {
  TelemetryHostRegistrationEntry,
  TelemetrySetup,
} from "../../../src/contexts/telemetry/domain/telemetry-setup.js";
import { printTelemetryCheckReport } from "../../../src/presentation/display/telemetry-check-display.js";
import { CLIOutput } from "../../../src/presentation/output.js";

/**
 * `aidd telemetry check` exists to send a person to the right place when nothing is being
 * recorded. Everything asserted here is about not sending them to the wrong one: a gated
 * run must not look like a judged one, an unreadable thing must not look like an absent
 * one, and the setup a person needs in order to act has to survive the gate.
 */
class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];
  readonly warnings: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
  override warn(message: string): void {
    this.warnings.push(message);
  }

  get text(): string {
    return this.lines.join("\n");
  }
}

function setup(overrides: Partial<TelemetrySetup> = {}): TelemetrySetup {
  return {
    allowed: {
      allowed: true,
      readable: true,
      location: "/repo/.aidd/config.json",
      decidedBy: "project-switch",
    },
    identity: { attached: false, path: "/home/.config/aidd/identity.json", readable: true },
    recordsLocation: { path: "/home/.config/aidd/telemetry" },
    hostRegistration: { entries: [] },
    commitTrailer: {
      delegate: "executable",
      callSite: "present",
      hookHasOtherContent: false,
      hooksDir: "/repo/.git/hooks",
      recentlyCarrying: { carrying: 3, examined: 5 },
    },
    recorderDeclaration: {
      declared: true,
      declaredAt: ["/repo/.aidd/manifest.json"],
      locationsChecked: ["/repo/.aidd/manifest.json"],
      unreadable: [],
    },
    versions: { cli: "5.2.2", plugin: { kind: "recorded", version: "1.0.0" } },
    ...overrides,
  };
}

describe("the setup a person reads before any claim", () => {
  // A gated run judges nothing — but what is in place is exactly what a person switched off
  // still needs to see, so the setup is printed on both sides of the gate.
  it("prints the setup even when the run was gated before judging anything", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      gate: "measurement is off — nothing to check until it is turned on",
      setup: setup(),
      leftoverExportConfig: [],
    });

    expect(output.text).toContain("measurement allowed");
    expect(output.text).toContain("records kept at");
    expect(output.text).toContain("measurement is off");
  });

  // The person's own refusal is a different fact from a project that never turned it on,
  // and only one of them is changed by editing the project's file.
  it("names a person's own refusal rather than reporting the project as off", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      gate: "measurement is off",
      setup: setup({
        allowed: {
          allowed: false,
          readable: true,
          location: "AIDD_TELEMETRY",
          decidedBy: "person-refusal",
        },
      }),
      leftoverExportConfig: [],
    });

    expect(output.text).toContain("this person's own refusal");
  });

  // Nothing declared is a person's cue to go and declare it somewhere, so the row lists
  // every candidate rather than saying only that none matched.
  it("lists every location it looked in when nothing declares the recorder", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      setup: setup({
        recorderDeclaration: {
          declared: false,
          declaredAt: [],
          locationsChecked: ["/repo/.aidd/manifest.json", "/repo/.claude/settings.json"],
          unreadable: [],
        },
      }),
      claims: [],
      uncovered: [],
      leftoverExportConfig: [],
    });

    expect(output.text).toContain("nowhere this build checks");
    expect(output.text).toContain("/repo/.claude/settings.json");
  });

  // A damaged file is something to fix; an absent declaration is an ordinary state. The row
  // must not print the first as the second.
  it("reads a damaged declaration location as unreadable, not as undeclared", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      setup: setup({
        recorderDeclaration: {
          declared: false,
          declaredAt: [],
          locationsChecked: [],
          unreadable: ["/repo/.aidd/manifest.json"],
        },
      }),
      claims: [],
      uncovered: [],
      leftoverExportConfig: [],
    });

    expect(output.text).toContain("could not be read");
    expect(output.text).not.toContain("nowhere this build checks");
  });

  it("names a plugin version nothing journalled apart from one that was never stamped", () => {
    const nothing = new CapturingOutput();
    printTelemetryCheckReport(nothing, {
      setup: setup({ versions: { cli: "5.2.2", plugin: { kind: "nothing-journalled" } } }),
      claims: [],
      uncovered: [],
      leftoverExportConfig: [],
    });
    const unstamped = new CapturingOutput();
    printTelemetryCheckReport(unstamped, {
      setup: setup({ versions: { cli: "5.2.2", plugin: { kind: "unrecorded" } } }),
      claims: [],
      uncovered: [],
      leftoverExportConfig: [],
    });

    const line = (o: CapturingOutput) => o.lines.find((l) => l.includes("plugin version")) ?? "";
    expect(line(nothing)).not.toBe(line(unstamped));
  });
});

describe("the claims, and what is deliberately not one", () => {
  it("prints a verdict and its detail for every claim judged", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      setup: setup(),
      claims: [
        {
          claim: "hook-fired",
          verdict: "ok",
          reason: "session-anchored",
          detail: "2 run file(s)",
        },
        {
          claim: "records-join",
          verdict: "fail",
          reason: "all-unattributed",
          detail: "nothing joined",
        },
      ],
      uncovered: [],
      leftoverExportConfig: [],
    });

    expect(output.text).toContain("2 run file(s)");
    expect(output.text).toContain("nothing joined");
  });

  it("names a tool nothing can read with its own reason, never as a failing claim", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      setup: setup(),
      claims: [],
      uncovered: [{ tool: "cursor", reason: "It writes no token count in any file it produces." }],
      leftoverExportConfig: [],
    });

    expect(output.text).toContain("not covered: cursor");
    expect(output.text).toContain("no token count");
  });

  // A stale export lives in a tool's own settings file, which no claim here can see — so it
  // is a warning on stderr, never one of the judged four.
  it("warns about a leftover export on stderr, on both sides of the gate", () => {
    const leftoverExportConfig = [
      { path: "/repo/.claude/settings.json", keys: ["OTEL_EXPORTER_OTLP_ENDPOINT"] },
    ];

    const judged = new CapturingOutput();
    printTelemetryCheckReport(judged, {
      setup: setup(),
      claims: [],
      uncovered: [],
      leftoverExportConfig,
    });
    const gated = new CapturingOutput();
    printTelemetryCheckReport(gated, {
      gate: "measurement is off",
      setup: setup(),
      leftoverExportConfig,
    });

    for (const output of [judged, gated]) {
      expect(output.warnings.join("\n")).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
      expect(output.text).not.toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
    }
  });
});

describe("the row saying whether the host will load what aidd installed", () => {
  function report(hostRegistration: TelemetrySetup["hostRegistration"]): string {
    const output = new CapturingOutput();
    printTelemetryCheckReport(output, {
      gate: "measurement is off",
      setup: setup({ hostRegistration }),
      leftoverExportConfig: [],
    });
    return output.text;
  }

  const REGISTRY = "/home/dev/.claude/plugins/installed_plugins.json";

  function entry(
    answer: TelemetryHostRegistrationEntry["answer"],
    plugin: string
  ): TelemetryHostRegistrationEntry {
    return { tool: "claude", plugin, answer, detail: REGISTRY };
  }

  // The one thing a person must not miss is what will not load. A reader who stops after the
  // first line has still read the problem.
  it("puts what will not load above what is fine", () => {
    const text = report({
      entries: [entry("registered", "fine"), entry("not-registered", "broken")],
    });

    expect(text.indexOf("broken")).toBeLessThan(text.indexOf("fine"));
  });

  it("orders a disabled registration and an unanswerable one between the two", () => {
    const text = report({
      entries: [
        entry("registered", "fine"),
        entry("unanswerable", "unknown"),
        entry("registered-disabled", "off"),
        entry("not-registered", "broken"),
      ],
    });
    const at = (plugin: string) => text.indexOf(plugin);

    expect(at("broken")).toBeLessThan(at("off"));
    expect(at("off")).toBeLessThan(at("unknown"));
    expect(at("unknown")).toBeLessThan(at("fine"));
  });

  it("names the answer and the detail on each line, never a bare pass", () => {
    const text = report({
      entries: [{ ...entry("not-registered", "aidd-telemetry"), detail: "does not carry it" }],
    });

    expect(text).toContain("claude/aidd-telemetry: not-registered — does not carry it");
  });

  // A project with nothing installed is healthy, and an empty block would read as a failure
  // to look rather than as an answer.
  it("says a project has no plugin recorded rather than printing nothing", () => {
    expect(report({ entries: [] })).toContain("no plugin recorded for any tool");
  });

  // The crash guard, made visible: a manifest that cannot be parsed is its own sentence, and
  // must never print as the empty case above — one is damage, the other is a normal state.
  it("says the manifest could not be read, distinctly from having nothing installed", () => {
    const text = report({
      entries: [],
      manifestUnreadable: "Cannot read properties of undefined (reading 'map')",
    });

    expect(text).toContain("AIDD's own manifest could not be read");
    expect(text).not.toContain("no plugin recorded");
  });
});

describe("the row saying whether commits carry their session", () => {
  function report(commitTrailer: TelemetrySetup["commitTrailer"]): string {
    const output = new CapturingOutput();
    printTelemetryCheckReport(output, {
      gate: "measurement is off",
      setup: setup({ commitTrailer }),
      leftoverExportConfig: [],
    });
    return output.text;
  }

  const HEALTHY = {
    delegate: "executable",
    callSite: "present",
    hookHasOtherContent: false,
    hooksDir: "/repo/.git/hooks",
  } as const;

  // The count leads, because it is the only fact here about the chain rather than its parts.
  // A person who reads one line has read whether it is working.
  it("leads with how many recent commits carry it", () => {
    const text = report({ ...HEALTHY, recentlyCarrying: { carrying: 4, examined: 20 } });

    expect(text).toContain("4 of the last 20 commits carry it");
  });

  it("says nothing about pieces when every piece is in place", () => {
    const text = report({ ...HEALTHY, recentlyCarrying: { carrying: 20, examined: 20 } });
    // Scoped to this row: every other setup row uses a dash of its own, so asserting over
    // the whole report would only prove the report has dashes in it.
    const row = text.split("\n").find((line) => line.includes("commit trailer")) ?? "";

    expect(row).not.toContain("—");
    expect(text).toContain("hooks run from /repo/.git/hooks");
  });

  it("names each missing piece after the count", () => {
    const text = report({
      ...HEALTHY,
      delegate: "absent",
      callSite: "missing",
      recentlyCarrying: { carrying: 0, examined: 20 },
    });

    expect(text).toContain("0 of the last 20 commits carry it");
    expect(text).toContain("nothing installed to write it");
    expect(text).toContain("prepare-commit-msg does not call it");
  });

  // Git will not run a hook it cannot execute, so present-but-not-executable is its own
  // sentence rather than a shade of installed.
  // Zero with every part in place is the finding this row exists to surface. Excusing it as
  // by-design was the one outcome that had to be impossible, and the guard read `>= 0`.
  it("never excuses zero, whatever else is in place", () => {
    const text = report({ ...HEALTHY, recentlyCarrying: { carrying: 0, examined: 20 } });

    expect(text).toContain("0 of the last 20 commits carry it");
    expect(text).not.toContain("by design");
  });

  it("says a hook git will not run is not executable", () => {
    const text = report({ ...HEALTHY, hookExecutable: false });

    expect(text).toContain("prepare-commit-msg is not executable");
  });

  it("says a delegate that is not executable will not be run", () => {
    expect(report({ ...HEALTHY, delegate: "not-executable" })).toContain("not executable");
  });

  // Said, never named. Which tool owns the file changes nothing a person does about it.
  it("says the hook is somebody else's without naming a tool", () => {
    const text = report({ ...HEALTHY, hookHasOtherContent: true });

    expect(text).toContain("somebody else's");
    expect(text).not.toMatch(/lefthook|husky/iu);
  });

  /**
   * A commit no session made carries no trailer by design, and merges are skipped outright.
   * So a number below the total is not a fault, and a bare "4 of 20" reads like one. The
   * qualifier appears exactly when it could mislead — some carrying, every part in place.
   */
  it("says a shortfall is expected when every part is in place", () => {
    const text = report({ ...HEALTHY, recentlyCarrying: { carrying: 4, examined: 20 } });

    expect(text).toContain("a commit no session made carries none, by design");
  });

  it("does not excuse a shortfall when a part is broken", () => {
    const text = report({
      ...HEALTHY,
      callSite: "missing",
      recentlyCarrying: { carrying: 4, examined: 20 },
    });

    expect(text).not.toContain("by design");
    expect(text).toContain("prepare-commit-msg does not call it");
  });

  // Outside a repository there is no hook to carry anything, which the claims below already
  // refuse to read as a failure. "nothing installed" would describe a repository we are not in.
  it("says there is no repository rather than listing missing pieces", () => {
    const text = report({
      delegate: "absent",
      callSite: "no-hook-file",
      hookHasOtherContent: false,
      hooksDirMissing: "no-repository",
    });

    expect(text).toContain("no repository here");
    expect(text).not.toContain("nothing installed");
  });

  /**
   * A repository whose git could not name its hooks directory still has a history, and the
   * count is the fact that matters. An earlier version printed "no repository here" for it —
   * measured false on a git that rejects `--git-path`, inside a repository with commits, one
   * of which carried the trailer. One true fact replaced by one false one.
   */
  it("keeps the count when git could not name the hooks directory", () => {
    const text = report({
      delegate: "absent",
      callSite: "no-hook-file",
      hookHasOtherContent: false,
      hooksDirMissing: "unresolved",
      recentlyCarrying: { carrying: 1, examined: 4 },
    });

    expect(text).toContain("1 of the last 4 commits carry it");
    expect(text).not.toContain("no repository here");
  });

  // No commits and no commits carrying it are different facts, and only the second is
  // something to act on.
  it("says there is no history to read rather than reporting zero", () => {
    const text = report(HEALTHY);

    expect(text).toContain("no commit history to read");
    expect(text).not.toContain("0 of the last");
  });
});
