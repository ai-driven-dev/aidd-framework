import { describe, expect, it } from "vitest";
import {
  printScopedFailures,
  printToolAlreadyInstalled,
  printToolInstalled,
  printToolRemoved,
  printUpdateResult,
} from "../../../src/presentation/display/framework-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printToolAlreadyInstalled", () => {
  it("warns that the tool is there and names the flag that reinstalls it", () => {
    const output = new CapturingOutput(false);

    printToolAlreadyInstalled(output, "claude");

    expect(output.at("warn")).toEqual(["claude is already installed. Use `--force` to reinstall."]);
  });
});

describe("printToolInstalled", () => {
  it("announces the tool and its file count when nothing warned", () => {
    const output = new CapturingOutput(false);

    printToolInstalled(output, "cursor", 12, []);

    expect(output.at("success")).toEqual(["Installed cursor (12 files)"]);
  });

  it("puts every warning before the success line, in the order given", () => {
    const output = new CapturingOutput(false);

    printToolInstalled(output, "codex", 3, ["first", "second"]);

    expect(output.captured).toEqual([
      { level: "warn", message: "first" },
      { level: "warn", message: "second" },
      { level: "success", message: "Installed codex (3 files)" },
    ]);
  });
});

describe("printToolRemoved", () => {
  it("announces the tool and how many files went with it", () => {
    const output = new CapturingOutput(false);

    printToolRemoved(output, "claude", 7);

    expect(output.at("success")).toEqual(["Removed claude (7 files removed)"]);
  });
});

describe("printUpdateResult", () => {
  it("says no tool is installed when there is neither an update nor an error", () => {
    const output = new CapturingOutput(false);

    printUpdateResult(output, [], []);

    expect(output.captured).toEqual([{ level: "info", message: "No tools installed." }]);
  });

  it("prints one success per updated tool, then every error", () => {
    const output = new CapturingOutput(false);

    printUpdateResult(
      output,
      [
        { toolId: "claude", fileCount: 4 },
        { toolId: "cursor", fileCount: 1 },
      ],
      [{ scope: "codex", message: "binary missing" }]
    );

    expect(output.captured).toEqual([
      { level: "success", message: "Updated claude (4 files)" },
      { level: "success", message: "Updated cursor (1 files)" },
      { level: "warn", message: "[codex] binary missing" },
    ]);
  });

  it("stays silent about missing tools once an update alone came back", () => {
    const output = new CapturingOutput(false);

    printUpdateResult(output, [{ toolId: "claude", fileCount: 2 }], []);

    expect(output.captured).toEqual([{ level: "success", message: "Updated claude (2 files)" }]);
  });

  it("stays silent about missing tools once an error alone came back", () => {
    const output = new CapturingOutput(false);

    printUpdateResult(output, [], [{ scope: "claude", message: "refused" }]);

    expect(output.captured).toEqual([{ level: "warn", message: "[claude] refused" }]);
  });
});

describe("printScopedFailures", () => {
  it("prints nothing when nothing failed", () => {
    const output = new CapturingOutput(false);

    printScopedFailures(output, []);

    expect(output.lines).toEqual([]);
  });

  it("warns one bracketed scope per failure, in the order given", () => {
    const output = new CapturingOutput(false);

    printScopedFailures(output, [
      { scope: "claude", message: "add refused" },
      { scope: "codex", message: "not on PATH" },
    ]);

    expect(output.at("warn")).toEqual(["[claude] add refused", "[codex] not on PATH"]);
  });
});
