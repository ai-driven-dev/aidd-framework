import { describe, expect, it } from "vitest";
import { printSelfUpdateResult } from "../../../src/presentation/display/update-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printSelfUpdateResult", () => {
  it("names the version already installed when nothing newer exists", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, { kind: "up-to-date", version: "1.2.3" });

    expect(output.at("success")).toEqual(["Already up to date (1.2.3)"]);
  });

  it("answers a check that found nothing newer the same way", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, { kind: "check-current", version: "1.2.3" });

    expect(output.at("success")).toEqual(["Already up to date (1.2.3)"]);
  });

  it("puts the newer version beside the current one when a check found one", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, {
      kind: "check-available",
      latestVersion: "2.0.0",
      currentVersion: "1.2.3",
    });

    expect(output.at("info")).toEqual(["New version available: 2.0.0 (current: 1.2.3)"]);
  });

  it("names the package a dry run would install", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, { kind: "dry-run", latestVersion: "2.0.0" });

    expect(output.at("info")).toEqual(["Would install @ai-driven-dev/cli@2.0.0"]);
  });

  it("confirms the new version without a path when the update reported none", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, { kind: "updated", latestVersion: "2.0.0" });

    expect(output.captured).toEqual([
      { level: "success", message: "Successfully updated to version 2.0.0" },
    ]);
  });

  it("appends the binary path the update wrote to", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, {
      kind: "updated",
      latestVersion: "2.0.0",
      binaryPath: "/usr/local/bin/aidd",
    });

    expect(output.at("success")).toEqual([
      "Successfully updated to version 2.0.0 (/usr/local/bin/aidd)",
    ]);
  });

  it("prints the changelog under its own heading after the confirmation", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, {
      kind: "updated",
      latestVersion: "2.0.0",
      changelog: "- fixed a thing",
    });

    expect(output.captured).toEqual([
      { level: "success", message: "Successfully updated to version 2.0.0" },
      { level: "info", message: "\nChangelog:\n- fixed a thing" },
    ]);
  });

  it("prints no changelog heading when the update carried an empty one", () => {
    const output = new CapturingOutput(false);

    printSelfUpdateResult(output, { kind: "updated", latestVersion: "2.0.0", changelog: null });

    expect(output.at("info")).toEqual([]);
  });
});
