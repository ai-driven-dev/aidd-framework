import { describe, expect, it } from "vitest";
import "../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { printNativeOnlyTools } from "../../../src/presentation/display/restore-display.js";
import { CLIOutput } from "../../../src/presentation/output.js";

class CapturingOutput extends CLIOutput {
  readonly lines: string[] = [];

  override warn(message: string): void {
    this.lines.push(message);
  }
}

describe("printNativeOnlyTools", () => {
  it("prints nothing when no tool was skipped", () => {
    const output = new CapturingOutput(false);

    printNativeOnlyTools(output, []);

    expect(output.lines).toEqual([]);
  });

  it("names each skipped tool and the command that registers it", () => {
    const output = new CapturingOutput(false);

    printNativeOnlyTools(output, ["claude", "codex"]);

    expect(output.lines).toEqual([
      "claude: plugins are registered by the claude CLI, not by this file tree; run `aidd framework install --tool claude` to register them.",
      "codex: plugins are registered by the codex CLI, not by this file tree; run `aidd framework install --tool codex` to register them.",
    ]);
  });
});
