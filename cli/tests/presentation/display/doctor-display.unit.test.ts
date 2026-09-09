import { describe, expect, it } from "vitest";
import {
  printAllToolsDrift,
  printInventory,
  printPluginIssues,
  printReportErrors,
  printScopeIssues,
  printToolDrift,
  printUserScopeTools,
} from "../../../src/presentation/display/doctor-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printPluginIssues", () => {
  it("prints nothing when there are no issues", () => {
    const output = new CapturingOutput(false);

    printPluginIssues(output, []);

    expect(output.lines).toEqual([]);
  });

  it("collapses every not-installed-on-machine issue for a tool into one line", () => {
    const output = new CapturingOutput(false);

    printPluginIssues(output, [
      { toolId: "cursor", pluginName: "aidd-context", issue: "not-installed-on-machine" },
      { toolId: "cursor", pluginName: "aidd-test", issue: "not-installed-on-machine" },
    ]);

    expect(output.lines).toEqual([
      "\nPlugins:",
      "  cursor: plugins not installed on this machine, run `aidd sync`",
    ]);
  });

  it("still prints one line per file for a genuinely drifted plugin", () => {
    const output = new CapturingOutput(false);

    printPluginIssues(output, [
      { toolId: "claude", pluginName: "my-plugin", issue: "missing", filePath: "commands/cmd.md" },
    ]);

    expect(output.lines).toEqual([
      "\nPlugins:",
      "  Plugin my-plugin (claude): missing — commands/cmd.md\n    Fix: Run `aidd sync`",
    ]);
  });
});

describe("printScopeIssues", () => {
  it("prints nothing when the scope was never reported on", () => {
    const output = new CapturingOutput(false);

    printScopeIssues(output, "AI", null);

    expect(output.lines).toEqual([]);
  });

  it("prints nothing when the scope reported no issue", () => {
    const output = new CapturingOutput(false);

    printScopeIssues(output, "AI", { issues: [] });

    expect(output.lines).toEqual([]);
  });

  it("heads the scope, then warns every informational issue before the rest", () => {
    const output = new CapturingOutput(false);

    printScopeIssues(output, "AI", {
      issues: [
        { severity: "error", message: "claude is not registered", fix: "Run `aidd sync`" },
        { severity: "info", message: "claude never ran", fix: "Start claude once" },
        { severity: "warning", message: "codex is ahead", fix: "Run `aidd update`" },
      ],
    });

    expect(output.lines).toEqual([
      "\nAI:",
      "  claude never ran\n    Fix: Start claude once",
      "  claude is not registered\n    Fix: Run `aidd sync`",
      "  codex is ahead\n    Fix: Run `aidd update`",
    ]);
  });

  it("sends an error issue to the error channel and everything else to the warning one", () => {
    const output = new CapturingOutput(false);

    printScopeIssues(output, "User scope", {
      issues: [
        { severity: "error", message: "claude is not registered", fix: "Run `aidd sync`" },
        { severity: "warning", message: "codex is ahead", fix: "Run `aidd update`" },
      ],
    });

    expect(output.at("error")).toEqual(["  claude is not registered\n    Fix: Run `aidd sync`"]);
    expect(output.at("warn")).toEqual(["  codex is ahead\n    Fix: Run `aidd update`"]);
  });
});

describe("printInventory", () => {
  it("prints nothing when the category holds no tool", () => {
    const output = new CapturingOutput(false);

    printInventory(output, "AI", { toolHealth: [] }, []);

    expect(output.lines).toEqual([]);
  });

  it("prints nothing when the category was never reported on", () => {
    const output = new CapturingOutput(false);

    printInventory(output, "AI", null, [{ toolId: "claude", version: "7.0.0" }]);

    expect(output.lines).toEqual([]);
  });

  it("heads the category, then counts each tool's files and merge files at its version", () => {
    const output = new CapturingOutput(false);

    printInventory(
      output,
      "AI",
      { toolHealth: [{ toolId: "claude", fileCount: 12, mergeFileCount: 2 }] },
      [
        { toolId: "cursor", version: "6.0.0" },
        { toolId: "claude", version: "7.0.0" },
      ]
    );

    expect(output.lines).toEqual(["\nAI tools:", "  claude (v7.0.0): 12 files, 2 merge files"]);
  });

  it("calls a version the status report never named unknown", () => {
    const output = new CapturingOutput(false);

    printInventory(
      output,
      "IDE",
      { toolHealth: [{ toolId: "vscode", fileCount: 1, mergeFileCount: 0 }] },
      []
    );

    expect(output.lines).toEqual(["\nIDE tools:", "  vscode (vunknown): 1 files, 0 merge files"]);
  });
});

describe("printReportErrors", () => {
  it("prints nothing when the run reported no error", () => {
    const output = new CapturingOutput(false);

    printReportErrors(output, []);

    expect(output.lines).toEqual([]);
  });

  it("warns each error under the scope it came from", () => {
    const output = new CapturingOutput(false);

    printReportErrors(output, [{ scope: "claude", message: "settings unreadable" }]);

    expect(output.at("warn")).toEqual(["[claude] settings unreadable"]);
  });
});

describe("printAllToolsDrift", () => {
  it("heads drift, then reports AI tools, IDE tools and plugins in that order", () => {
    const output = new CapturingOutput(false);

    printAllToolsDrift(output, {
      aiTools: { tools: [{ toolId: "claude", version: "7.0.0", drifted: [] }] },
      ideTools: { tools: [] },
      pluginDrift: [],
    });

    expect(output.lines).toEqual([
      "\nDrift:",
      "AI tools:",
      "  claude (v7.0.0): in sync",
      "IDE tools:",
      "  (none installed)",
      "Plugins:",
      "  (all in sync)",
    ]);
  });
});

describe("printToolDrift", () => {
  it("heads drift, then reports the one tool and its plugins, naming no category", () => {
    const output = new CapturingOutput(false);

    printToolDrift(output, {
      tools: [{ toolId: "claude", version: "7.0.0", drifted: [] }],
      pluginDrift: [],
    });

    expect(output.lines).toEqual([
      "\nDrift:",
      "  claude (v7.0.0): in sync",
      "Plugins:",
      "  (all in sync)",
    ]);
  });
});

describe("printUserScopeTools", () => {
  it("heads the machine-wide tools even when none is registered", () => {
    const output = new CapturingOutput(false);

    printUserScopeTools(output, []);

    expect(output.lines).toEqual(["User-scope tools:"]);
  });

  it("names each tool, its version and the file its activation is expected in", () => {
    const output = new CapturingOutput(false);

    printUserScopeTools(output, [
      { toolId: "claude", version: "7.0.0", settings: "/home/me/.claude/settings.json" },
      { toolId: "codex", version: "unknown", settings: "no user-scope settings file" },
    ]);

    expect(output.lines).toEqual([
      "User-scope tools:",
      "  claude (v7.0.0): expects activation in /home/me/.claude/settings.json",
      "  codex (vunknown): expects activation in no user-scope settings file",
    ]);
  });
});
