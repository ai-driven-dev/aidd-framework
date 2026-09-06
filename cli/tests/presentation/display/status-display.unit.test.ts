import { describe, expect, it } from "vitest";
import { printPluginDrift } from "../../../src/presentation/display/status-display.js";
import { CLIOutput } from "../../../src/presentation/output.js";

class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
}

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
