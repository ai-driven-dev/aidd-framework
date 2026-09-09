import { describe, expect, it } from "vitest";
import {
  printDriftStats,
  printPluginDrift,
  printScopeReport,
} from "../../../src/presentation/display/status-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printScopeReport", () => {
  it("says nothing is installed when the scope carries no tool", () => {
    const output = new CapturingOutput(false);

    printScopeReport(output, { tools: [] });

    expect(output.lines).toEqual(["  (none installed)"]);
  });

  it("names a tool and its version as in sync when no file drifted", () => {
    const output = new CapturingOutput(false);

    printScopeReport(output, { tools: [{ toolId: "claude", version: "7.0.0", drifted: [] }] });

    expect(output.lines).toEqual(["  claude (v7.0.0): in sync"]);
  });

  it("marks a modified file '~', a deleted one '-' and an added one '+', then counts them", () => {
    const output = new CapturingOutput(false);

    printScopeReport(output, {
      tools: [
        {
          toolId: "claude",
          version: "7.0.0",
          drifted: [
            { status: "modified", relativePath: "a.md" },
            { status: "deleted", relativePath: "b.md" },
            { status: "added", relativePath: "c.md" },
          ],
        },
      ],
    });

    expect(output.lines).toEqual([
      "  claude (v7.0.0):",
      "    ~ a.md",
      "    - b.md",
      "    + c.md",
      "  1 modified, 1 deleted, 1 added",
    ]);
  });

  it("marks a status it has no symbol for '?'", () => {
    const output = new CapturingOutput(false);

    printScopeReport(output, {
      tools: [
        {
          toolId: "cursor",
          version: "7.0.0",
          drifted: [{ status: "renamed", relativePath: "d.md" }],
        },
      ],
    });

    expect(output.lines).toEqual([
      "  cursor (v7.0.0):",
      "    ? d.md",
      "  0 modified, 0 deleted, 0 added",
    ]);
  });
});

describe("printDriftStats", () => {
  it("counts each drift kind on one line", () => {
    const output = new CapturingOutput(false);

    printDriftStats(output, [
      { status: "modified" },
      { status: "modified" },
      { status: "deleted" },
      { status: "added" },
      { status: "added" },
      { status: "added" },
    ]);

    expect(output.lines).toEqual(["  2 modified, 1 deleted, 3 added"]);
  });
});

describe("printPluginDrift", () => {
  it("prints '(all in sync)' only when nothing was skipped and nothing drifted", () => {
    const output = new CapturingOutput(false);

    printPluginDrift(output, { pluginDrift: [] });

    expect(output.lines).toEqual(["  (all in sync)"]);
  });

  it("prints one line per tool for a plugin never installed on this machine", () => {
    const output = new CapturingOutput(false);

    printPluginDrift(output, {
      pluginDrift: [
        {
          toolId: "cursor",
          pluginName: "aidd-test",
          driftedFiles: [],
          notInstalledOnMachine: true,
        },
      ],
    });

    expect(output.lines).toEqual([
      "  cursor: plugins not installed on this machine, run `aidd sync`",
    ]);
  });

  it("still prints per-file drift lines for a genuinely modified plugin", () => {
    const output = new CapturingOutput(false);

    printPluginDrift(output, {
      pluginDrift: [
        {
          toolId: "claude",
          pluginName: "my-plugin",
          driftedFiles: ["commands/cmd.md"],
          notInstalledOnMachine: false,
        },
      ],
    });

    expect(output.lines).toEqual(["  plugin my-plugin (claude):", "    ~ commands/cmd.md"]);
  });
});
