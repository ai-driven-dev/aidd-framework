import { describe, expect, it } from "vitest";
import { printPluginIssues } from "../../../src/presentation/display/doctor-display.js";
import { CLIOutput } from "../../../src/presentation/output.js";

class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override print(message: string): void {
    this.lines.push(message);
  }
  override error(message: string): void {
    this.lines.push(message);
  }
  override warn(message: string): void {
    this.lines.push(message);
  }
}

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
