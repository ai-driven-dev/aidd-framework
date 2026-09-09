import { describe, expect, it } from "vitest";
import { printNativeActivation } from "../../../src/presentation/display/restore-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printNativeActivation", () => {
  it("prints nothing when every tool's CLI ran", () => {
    const output = new CapturingOutput(false);

    printNativeActivation(output, []);

    expect(output.lines).toEqual([]);
  });

  it("names each tool and binary whose CLI was not on PATH, and what that means for the plugin", () => {
    const output = new CapturingOutput(false);

    printNativeActivation(output, [
      { toolId: "claude", binary: "claude" },
      { toolId: "codex", binary: "codex" },
    ]);

    expect(output.lines).toEqual([
      "claude: the plugin will not load until the claude CLI has run.",
      "codex: the plugin will not load until the codex CLI has run.",
    ]);
  });
});
