import { describe, expect, it } from "vitest";
import type { TelemetrySetup } from "../../../src/contexts/telemetry/domain/telemetry-setup.js";
import type { HostRegistrationEntry } from "../../../src/contexts/tools/domain/host-plugin-registration.js";
import { printTelemetryCheckReport } from "../../../src/presentation/display/telemetry-check-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

/** Everything here is about not sending a person to the wrong place: a gated run must not
 * look like a judged one, nor an unreadable thing like an absent one. */
function reportText(output: CapturingOutput): string {
  return output.at("print").join("\n");
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

    expect(reportText(output)).toContain("measurement allowed");
    expect(reportText(output)).toContain("records kept at");
    expect(reportText(output)).toContain("measurement is off");
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

    expect(reportText(output)).toContain("this person's own refusal");
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

    expect(reportText(output)).toContain("nowhere this build checks");
    expect(reportText(output)).toContain("/repo/.claude/settings.json");
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

    expect(reportText(output)).toContain("could not be read");
    expect(reportText(output)).not.toContain("nowhere this build checks");
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

    const line = (o: CapturingOutput) =>
      o.at("print").find((l) => l.includes("plugin version")) ?? "";
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

    expect(reportText(output)).toContain("2 run file(s)");
    expect(reportText(output)).toContain("nothing joined");
  });

  it("names a tool nothing can read with its own reason, never as a failing claim", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      setup: setup(),
      claims: [],
      uncovered: [{ tool: "cursor", reason: "It writes no token count in any file it produces." }],
      leftoverExportConfig: [],
    });

    expect(reportText(output)).toContain("not covered: cursor");
    expect(reportText(output)).toContain("no token count");
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
      expect(output.at("warn").join("\n")).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
      expect(reportText(output)).not.toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
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
    return reportText(output);
  }

  const REGISTRY = "/home/dev/.claude/plugins/installed_plugins.json";

  function entry(answer: HostRegistrationEntry["answer"], plugin: string): HostRegistrationEntry {
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
    return reportText(output);
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

  // Zero with every part in place is the finding this row exists to surface, so excusing it
  // as by-design is the one outcome that must be impossible.
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

  /** `hookManager` is read from a root marker file, never from the hook's own contents, which
   * is what makes naming a tool honest: a hand-written hook stays unnamed. */
  describe("where lefthook or husky owns prepare-commit-msg", () => {
    it("names lefthook and prints the job to add, when its config does not call the delegate", () => {
      const text = report({
        delegate: "absent",
        callSite: "missing",
        hookHasOtherContent: true,
        hooksDir: "/repo/.git/hooks",
        hookManager: "lefthook",
        managerCallsDelegate: false,
      });

      expect(text).toContain("lefthook");
      expect(text).toContain("prepare-commit-msg:");
      expect(text).toContain("add this command under `prepare-commit-msg:`");
      expect(text).not.toContain("does not call it");
    });

    it("names husky and prints the line to add, when its config does not call the delegate", () => {
      const text = report({
        delegate: "absent",
        callSite: "missing",
        hookHasOtherContent: true,
        hooksDir: "/repo/.git/hooks",
        hookManager: "husky",
        managerCallsDelegate: false,
      });

      expect(text).toContain("husky");
      expect(text).toContain(".husky/prepare-commit-msg");
      expect(text).toContain("add this line to .husky/prepare-commit-msg");
      expect(text).not.toContain("does not call it");
    });

    // `callSite: "missing"` describes the absolute-path line this CLI looks for, which a
    // manager never calls the delegate through — not a fault once its own config does.
    it("reports the chain wired through the manager and prints no job, once its config already calls the delegate", () => {
      const text = report({
        delegate: "executable",
        callSite: "missing",
        hookHasOtherContent: true,
        hooksDir: "/repo/.git/hooks",
        hookManager: "lefthook",
        managerCallsDelegate: true,
      });

      expect(text).toContain("wired through lefthook");
      expect(text).not.toContain("does not call it");
      expect(text).not.toContain("add this command");
      expect(text).not.toContain("prepare-commit-msg:");
    });

    // A config naming the job is not the delegate being there to answer it: a checkout where
    // `telemetry on` was never run must not read as wired.
    it("does not report wired when nothing was ever installed to answer the call", () => {
      const text = report({
        delegate: "absent",
        callSite: "missing",
        hookHasOtherContent: false,
        hooksDir: "/repo/.git/hooks",
        hookManager: "lefthook",
        managerCallsDelegate: true,
      });

      expect(text).not.toContain("wired through lefthook's own prepare-commit-msg");
      expect(text).toContain("nothing installed to write it");
      expect(text).toContain("aidd telemetry on");
    });

    it("says the script is not executable rather than wired, when it cannot run", () => {
      const text = report({
        delegate: "not-executable",
        callSite: "missing",
        hookHasOtherContent: false,
        hooksDir: "/repo/.git/hooks",
        hookManager: "husky",
        managerCallsDelegate: true,
      });

      expect(text).not.toContain("wired through husky's own prepare-commit-msg");
      expect(text).toContain("not executable");
    });
  });

  // A commit no session made carries no trailer by design and merges are skipped, so a bare
  // "4 of 20" would read as a fault when it is not one.
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

  // A git that rejects `--git-path` still sits inside a repository with a history, so the
  // count stays the fact that matters.
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

const RECORDS_ROW =
  "  records kept at       /home/.config/aidd/telemetry (override with AIDD_TELEMETRY_DIR)";
const BY_DESIGN_TRAILER_ROW =
  "  commit trailer        3 of the last 5 commits carry it — a commit no session made " +
  "carries none, by design\n    hooks run from /repo/.git/hooks";

function reportLines(result: Parameters<typeof printTelemetryCheckReport>[1]): string[] {
  const output = new CapturingOutput();
  printTelemetryCheckReport(output, result);
  return output.at("print");
}

describe("printTelemetryCheckReport — the setup block, whole", () => {
  it("prints eight labelled rows, a blank line, then the gate that stopped the run", () => {
    expect(
      reportLines({
        gate: "measurement is off — nothing to check until it is turned on",
        setup: setup(),
        leftoverExportConfig: [],
      })
    ).toEqual([
      "  measurement allowed   yes — /repo/.aidd/config.json",
      "  identity attached     no — /home/.config/aidd/identity.json",
      RECORDS_ROW,
      "  recorder declared     yes — /repo/.aidd/manifest.json",
      "  plugins registered    no plugin recorded for any tool",
      BY_DESIGN_TRAILER_ROW,
      "  cli version           5.2.2",
      "  plugin version        1.0.0 (as the hook recorded it)",
      "",
      "  measurement is off — nothing to check until it is turned on",
    ]);
  });

  it("reads every unreadable location as unreadable, never as an absent one", () => {
    expect(
      reportLines({
        gate: "off",
        setup: setup({
          allowed: {
            allowed: false,
            readable: false,
            location: "/repo/.aidd/config.json",
            decidedBy: "project-switch",
          },
          identity: { attached: false, path: "/h/identity.json", readable: false },
          recorderDeclaration: {
            declared: false,
            declaredAt: [],
            locationsChecked: [],
            unreadable: ["/repo/.aidd/manifest.json"],
          },
          hostRegistration: { entries: [], manifestUnreadable: "boom" },
          versions: { cli: "5.2.2", plugin: { kind: "nothing-journalled" } },
        }),
        leftoverExportConfig: [],
      }).slice(0, 8)
    ).toEqual([
      "  measurement allowed   could not be read — /repo/.aidd/config.json",
      "  identity attached     could not be read — /h/identity.json",
      RECORDS_ROW,
      "  recorder declared     could not be read — /repo/.aidd/manifest.json",
      "  plugins registered    AIDD's own manifest could not be read — boom",
      BY_DESIGN_TRAILER_ROW,
      "  cli version           5.2.2",
      "  plugin version        no session journalled yet",
    ]);
  });

  it("names a person's own refusal, an attached identity and the locations it looked in", () => {
    expect(
      reportLines({
        gate: "off",
        setup: setup({
          allowed: {
            allowed: false,
            readable: true,
            location: "AIDD_TELEMETRY",
            decidedBy: "person-refusal",
          },
          identity: { attached: true, path: "/h/identity.json", readable: true },
          recorderDeclaration: {
            declared: false,
            declaredAt: [],
            locationsChecked: ["/repo/.aidd/manifest.json", "/repo/.claude/settings.json"],
            unreadable: [],
          },
          versions: { cli: "5.2.2", plugin: { kind: "unrecorded" } },
        }),
        leftoverExportConfig: [],
      }).slice(0, 8)
    ).toEqual([
      "  measurement allowed   no — this person's own refusal (AIDD_TELEMETRY)",
      "  identity attached     yes — /h/identity.json",
      RECORDS_ROW,
      "  recorder declared     nowhere this build checks — looked in:\n" +
        "    /repo/.aidd/manifest.json\n    /repo/.claude/settings.json",
      "  plugins registered    no plugin recorded for any tool",
      BY_DESIGN_TRAILER_ROW,
      "  cli version           5.2.2",
      "  plugin version        unknown — no journalled session names one. The plugin's own " +
        "manifest was not beside its hooks and no `aidd` install recorded it; `aidd plugin " +
        "install aidd-telemetry` would make it known.",
    ]);
  });
});

describe("printTelemetryCheckReport — every claim, in its own column", () => {
  it("prints each claim's own name and verdict token, then its detail", () => {
    expect(
      reportLines({
        setup: setup(),
        claims: [
          {
            claim: "hook-fired",
            verdict: "ok",
            reason: "session-anchored",
            detail: "2 run file(s)",
          },
          {
            claim: "session-journalled",
            verdict: "unknown",
            reason: "no-session-named",
            detail: "none yet",
          },
          {
            claim: "tool-files-readable",
            verdict: "fail",
            reason: "no-run-file-to-read",
            detail: "EACCES",
          },
          { claim: "records-join", verdict: "fail", reason: "all-unattributed", detail: "none" },
        ],
        uncovered: [{ tool: "cursor", reason: "It writes no token count." }],
        leftoverExportConfig: [],
      }).slice(9)
    ).toEqual([
      "  hook fired            ok    2 run file(s)",
      "  session journalled    --    none yet",
      "  tool files readable   FAIL  EACCES",
      "  records join          FAIL  none",
      "  not covered: cursor   --    It writes no token count.",
    ]);
  });

  it("names every key of a leftover export, and what to do about it, on stderr", () => {
    const output = new CapturingOutput();

    printTelemetryCheckReport(output, {
      gate: "off",
      setup: setup(),
      leftoverExportConfig: [
        { path: "/repo/.claude/settings.json", keys: ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_A"] },
      ],
    });

    expect(output.at("warn")).toEqual([
      "/repo/.claude/settings.json still sets OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_A — delete " +
        "these keys from its `env` block by hand to stop that export; nothing here can do it " +
        "for you.",
    ]);
  });
});

describe("printTelemetryCheckReport — the plugins-registered headline", () => {
  function pluginsRow(hostRegistration: TelemetrySetup["hostRegistration"]): string {
    return (
      reportLines({
        gate: "off",
        setup: setup({ hostRegistration }),
        leftoverExportConfig: [],
      })[4] ?? ""
    );
  }

  it("counts what will not load against the total, worst first", () => {
    expect(
      pluginsRow({
        entries: [
          { tool: "claude", plugin: "fine", answer: "registered", detail: "R" },
          { tool: "claude", plugin: "broken", answer: "not-registered", detail: "R" },
        ],
      })
    ).toBe(
      "  plugins registered    1 of 2 will not load, or could not be answered\n" +
        "    claude/broken: not-registered — R\n    claude/fine: registered — R"
    );
  });

  it("says all of them will load when none is in trouble", () => {
    expect(
      pluginsRow({
        entries: [
          { tool: "claude", plugin: "a", answer: "registered", detail: "R" },
          { tool: "codex", plugin: "b", answer: "registered", detail: "R" },
        ],
      })
    ).toBe(
      "  plugins registered    all 2 will load\n    claude/a: registered — R\n" +
        "    codex/b: registered — R"
    );
  });
});

describe("printTelemetryCheckReport — the commit-trailer row, word for word", () => {
  const HEALTHY_ROW = {
    delegate: "executable",
    callSite: "present",
    hookHasOtherContent: false,
    hooksDir: "/repo/.git/hooks",
  } as const;
  const HOOKS_FROM = "\n    hooks run from /repo/.git/hooks";

  function trailerRow(commitTrailer: TelemetrySetup["commitTrailer"]): string {
    return (
      reportLines({ gate: "off", setup: setup({ commitTrailer }), leftoverExportConfig: [] })[5] ??
      ""
    );
  }

  it("says only the count when every commit carries it", () => {
    expect(trailerRow({ ...HEALTHY_ROW, recentlyCarrying: { carrying: 20, examined: 20 } })).toBe(
      `  commit trailer        20 of the last 20 commits carry it${HOOKS_FROM}`
    );
  });

  it("excuses a shortfall only where some commits carry it and every part is in place", () => {
    expect(trailerRow({ ...HEALTHY_ROW, recentlyCarrying: { carrying: 4, examined: 20 } })).toBe(
      "  commit trailer        4 of the last 20 commits carry it — a commit no session made " +
        `carries none, by design${HOOKS_FROM}`
    );
  });

  it("never excuses zero, however healthy every part is", () => {
    expect(trailerRow({ ...HEALTHY_ROW, recentlyCarrying: { carrying: 0, examined: 20 } })).toBe(
      `  commit trailer        0 of the last 20 commits carry it${HOOKS_FROM}`
    );
  });

  it("says there is no history to read rather than reporting a zero", () => {
    expect(trailerRow(HEALTHY_ROW)).toBe(
      `  commit trailer        no commit history to read${HOOKS_FROM}`
    );
  });

  it("names every broken piece after the count, in one sentence", () => {
    expect(
      trailerRow({
        ...HEALTHY_ROW,
        delegate: "absent",
        callSite: "missing",
        hookExecutable: false,
        hookHasOtherContent: true,
        recentlyCarrying: { carrying: 0, examined: 20 },
      })
    ).toBe(
      "  commit trailer        0 of the last 20 commits carry it — nothing installed to write " +
        "it; prepare-commit-msg does not call it; prepare-commit-msg is not executable, so git " +
        `ignores it; that hook is somebody else's too${HOOKS_FROM}`
    );
  });

  it("says a delegate git cannot run is not executable", () => {
    expect(trailerRow({ ...HEALTHY_ROW, delegate: "not-executable" })).toBe(
      "  commit trailer        no commit history to read — its script is not executable, so " +
        `git will not run it${HOOKS_FROM}`
    );
  });

  it("says there is no hook file at all, rather than that one does not call the delegate", () => {
    expect(trailerRow({ ...HEALTHY_ROW, callSite: "no-hook-file" })).toBe(
      `  commit trailer        no commit history to read — there is no prepare-commit-msg${HOOKS_FROM}`
    );
  });

  it("says there is no repository, and names no hooks directory it does not have", () => {
    expect(
      trailerRow({
        delegate: "absent",
        callSite: "no-hook-file",
        hookHasOtherContent: false,
        hooksDirMissing: "no-repository",
      })
    ).toBe("  commit trailer        no repository here, so no hook to carry it");
  });

  it("keeps the count when git would not say where it runs hooks from", () => {
    expect(
      trailerRow({
        delegate: "absent",
        callSite: "no-hook-file",
        hookHasOtherContent: false,
        hooksDirMissing: "unresolved",
        recentlyCarrying: { carrying: 1, examined: 4 },
      })
    ).toBe(
      "  commit trailer        1 of the last 4 commits carry it — git could not say where it " +
        "runs hooks from"
    );
  });
});

describe("printTelemetryCheckReport — where lefthook or husky owns the hook", () => {
  const HOOKS_FROM = "\n    hooks run from /repo/.git/hooks";

  function trailerRow(commitTrailer: TelemetrySetup["commitTrailer"]): string {
    return (
      reportLines({ gate: "off", setup: setup({ commitTrailer }), leftoverExportConfig: [] })[5] ??
      ""
    );
  }

  it("reports the chain wired through the manager once its config calls the delegate", () => {
    expect(
      trailerRow({
        delegate: "executable",
        callSite: "missing",
        hookHasOtherContent: true,
        hooksDir: "/repo/.git/hooks",
        hookManager: "lefthook",
        managerCallsDelegate: true,
        recentlyCarrying: { carrying: 2, examined: 4 },
      })
    ).toBe(
      "  commit trailer        2 of the last 4 commits carry it — a commit no session made " +
        "carries none, by design — wired through lefthook's own prepare-commit-msg" +
        HOOKS_FROM
    );
  });

  it("refuses to call a checkout wired when nothing was installed to answer the call", () => {
    expect(
      trailerRow({
        delegate: "absent",
        callSite: "missing",
        hookHasOtherContent: false,
        hooksDir: "/repo/.git/hooks",
        hookManager: "lefthook",
        managerCallsDelegate: true,
      })
    ).toBe(
      "  commit trailer        no commit history to read — wired through lefthook, but nothing " +
        `installed to write it; run \`aidd telemetry on\`${HOOKS_FROM}`
    );
  });

  it("names an unrunnable script rather than reporting the manager as wired", () => {
    expect(
      trailerRow({
        delegate: "not-executable",
        callSite: "missing",
        hookHasOtherContent: false,
        hooksDir: "/repo/.git/hooks",
        hookManager: "husky",
        managerCallsDelegate: true,
      })
    ).toBe(
      "  commit trailer        no commit history to read — wired through husky, but its script " +
        `is not executable, so git will not run it; run \`aidd telemetry on\`${HOOKS_FROM}`
    );
  });
});
