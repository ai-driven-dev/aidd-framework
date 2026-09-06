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

    printPluginDrift(output, { pluginDrift: [], pluginNativeOnly: [] });

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
      pluginNativeOnly: [],
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
      pluginNativeOnly: [],
    });

    expect(output.lines).toEqual(["  plugin my-plugin (claude):", "    ~ commands/cmd.md"]);
  });

  // Mutation proof for item 3: drop the native-only check in the caller and this test
  // goes red because the array feeding it would stay empty, printing "(all in sync)"
  // for a tool whose plugin was never checked.
  it("never reports '(all in sync)' for a native-activation tool with nothing tracked", () => {
    const output = new CapturingOutput(false);

    printPluginDrift(output, {
      pluginDrift: [],
      pluginNativeOnly: [{ toolId: "claude", binary: "claude" }],
    });

    expect(output.lines).toEqual(["  claude: registered by claude, not verified here"]);
    expect(output.lines).not.toContain("  (all in sync)");
  });
});
