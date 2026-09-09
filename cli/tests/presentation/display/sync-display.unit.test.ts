import { describe, expect, it } from "vitest";
import {
  printActivationOutcome,
  printRestoreOutcome,
  printToolRestoreOutcome,
  printUserScopeSyncOutcome,
} from "../../../src/presentation/display/sync-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printRestoreOutcome", () => {
  it("says nothing was modified when nothing errored, restored or resisted restoration", () => {
    const output = new CapturingOutput(false);

    printRestoreOutcome(output, {
      errors: [],
      totalRestored: 0,
      totalKept: 0,
      pluginNamesRestored: [],
      unrestorable: [],
    });

    expect(output.lines).toEqual(["Nothing to restore — all files are unmodified."]);
  });

  it("warns each error under its scope before anything else, and never calls the run clean", () => {
    const output = new CapturingOutput(false);

    printRestoreOutcome(output, {
      errors: [{ scope: "claude", message: "settings unreadable" }],
      totalRestored: 0,
      totalKept: 0,
      pluginNamesRestored: [],
      unrestorable: [],
    });

    expect(output.lines).toEqual(["[claude] settings unreadable"]);
    expect(output.at("warn")).toEqual(["[claude] settings unreadable"]);
  });

  it("counts restored and kept files when files were the only thing restored", () => {
    const output = new CapturingOutput(false);

    printRestoreOutcome(output, {
      errors: [],
      totalRestored: 3,
      totalKept: 2,
      pluginNamesRestored: [],
      unrestorable: [],
    });

    expect(output.lines).toEqual(["Restored 3 file(s), kept 2 file(s)"]);
  });

  it("names the restored plugins even when no tracked file was restored", () => {
    const output = new CapturingOutput(false);

    printRestoreOutcome(output, {
      errors: [],
      totalRestored: 0,
      totalKept: 0,
      pluginNamesRestored: ["aidd-dev", "aidd-pm"],
      unrestorable: [],
    });

    expect(output.lines).toEqual(["Restored plugins: aidd-dev, aidd-pm"]);
  });

  it("warns about files the current distribution no longer carries, restoring nothing else", () => {
    const output = new CapturingOutput(false);

    printRestoreOutcome(output, {
      errors: [],
      totalRestored: 0,
      totalKept: 0,
      pluginNamesRestored: [],
      unrestorable: ["old/skill.md"],
    });

    expect(output.lines).toEqual([
      "Could not restore 1 file(s) no longer part of the current distribution: old/skill.md",
    ]);
  });
});

describe("printToolRestoreOutcome", () => {
  it("says nothing was modified when every tool had nothing to restore", () => {
    const output = new CapturingOutput(false);

    printToolRestoreOutcome(output, {
      tools: [{ nothingToRestore: true }],
      totalRestored: 0,
      totalKept: 0,
      unrestorable: [],
    });

    expect(output.lines).toEqual(["Nothing to restore — all files are unmodified."]);
  });

  it("restores when one tool of several had something to restore", () => {
    const output = new CapturingOutput(false);

    printToolRestoreOutcome(output, {
      tools: [{ nothingToRestore: true }, { nothingToRestore: false }],
      totalRestored: 1,
      totalKept: 0,
      unrestorable: [],
    });

    expect(output.lines).toEqual(["Restored 1 file, kept 0 files"]);
  });

  it("counts one restored and one kept file in the singular", () => {
    const output = new CapturingOutput(false);

    printToolRestoreOutcome(output, {
      tools: [{ nothingToRestore: false }],
      totalRestored: 1,
      totalKept: 1,
      unrestorable: [],
    });

    expect(output.lines).toEqual(["Restored 1 file, kept 1 file"]);
  });

  it("counts several restored and kept files in the plural, then what could not be restored", () => {
    const output = new CapturingOutput(false);

    printToolRestoreOutcome(output, {
      tools: [{ nothingToRestore: false }],
      totalRestored: 2,
      totalKept: 3,
      unrestorable: ["gone.md"],
    });

    expect(output.lines).toEqual([
      "Restored 2 files, kept 3 files",
      "Could not restore 1 file(s) no longer part of the current distribution: gone.md",
    ]);
  });
});

describe("printActivationOutcome", () => {
  it("prints nothing when every binary was there and nothing errored", () => {
    const output = new CapturingOutput(false);

    printActivationOutcome(output, { binaryMissing: [], errors: [] });

    expect(output.lines).toEqual([]);
  });

  it("warns about a missing host binary before the errors of the same run", () => {
    const output = new CapturingOutput(false);

    printActivationOutcome(output, {
      binaryMissing: [{ toolId: "claude", binary: "claude" }],
      errors: [{ scope: "codex", message: "add refused" }],
    });

    expect(output.at("warn")).toEqual([
      "claude: the plugin will not load until the claude CLI has run.",
      "[codex] add refused",
    ]);
  });
});

describe("printUserScopeSyncOutcome", () => {
  it("says no tool is registered at user scope when none was activated", () => {
    const output = new CapturingOutput(false);

    printUserScopeSyncOutcome(output, []);

    expect(output.at("success")).toEqual([
      "Nothing to sync — no tool is registered at user scope yet.",
    ]);
  });

  it("names every tool whose native activation was synced", () => {
    const output = new CapturingOutput(false);

    printUserScopeSyncOutcome(output, ["claude", "codex"]);

    expect(output.at("success")).toEqual(["Synced native activation for: claude, codex"]);
  });
});
