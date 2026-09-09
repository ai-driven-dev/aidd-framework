import { describe, expect, it } from "vitest";
import { printTranslateResult } from "../../../src/presentation/display/translate-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printTranslateResult", () => {
  it("says what was built and where, for a marketplace layout", () => {
    const output = new CapturingOutput(false);

    printTranslateResult(output, "marketplace", {
      pluginCount: 3,
      totalFiles: 42,
      outDir: "/tmp/out",
    });

    expect(output.at("success")).toEqual(["Built 3 plugins, 42 files written to /tmp/out"]);
  });

  it("says what was flat-installed and under where, for a flat layout", () => {
    const output = new CapturingOutput(false);

    printTranslateResult(output, "flat", {
      pluginCount: 3,
      totalFiles: 42,
      outDir: "/tmp/out",
    });

    expect(output.at("success")).toEqual([
      "Flat-installed 3 plugins, 42 files written under /tmp/out",
    ]);
  });
});
