import { describe, expect, it } from "vitest";
import {
  printInstalledRules,
  printInstalledRulesJson,
} from "../../../src/presentation/display/installed-rules-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

describe("printInstalledRulesJson", () => {
  it("prints an empty inventory as an empty array, not as nothing", () => {
    const output = new CapturingOutput(false);

    printInstalledRulesJson(output, []);

    expect(output.at("print")).toEqual(["[]"]);
  });

  it("prints the inventory two-space indented, the shape its readers parse", () => {
    const output = new CapturingOutput(false);

    printInstalledRulesJson(output, [
      {
        tool: "claude",
        path: ".claude/rules/a.md",
        name: "a",
        description: "a rule",
        paths: ["src/**"],
      },
    ]);

    expect(output.at("print")).toEqual([
      '[\n  {\n    "tool": "claude",\n    "path": ".claude/rules/a.md",\n    "name": "a",\n    "description": "a rule",\n    "paths": [\n      "src/**"\n    ]\n  }\n]',
    ]);
  });
});

describe("printInstalledRules", () => {
  it("says no rule is installed rather than printing nothing", () => {
    const output = new CapturingOutput(false);

    printInstalledRules(output, []);

    expect(output.captured).toEqual([
      { level: "info", message: "No rules installed for any AI tool." },
    ]);
  });

  it("prints a rule's tool, path, description and the paths it is scoped to", () => {
    const output = new CapturingOutput(false);

    printInstalledRules(output, [
      {
        tool: "claude",
        path: ".claude/rules/a.md",
        name: "a",
        description: "a rule",
        paths: ["src/**", "tests/**"],
      },
    ]);

    expect(output.at("print")).toEqual([
      "claude  .claude/rules/a.md",
      "  a rule",
      "  applies to: src/**, tests/**",
    ]);
  });

  it("reads an absent path list as every file, not as an empty scope", () => {
    const output = new CapturingOutput(false);

    printInstalledRules(output, [
      { tool: "cursor", path: ".cursor/rules/a.mdc", name: "a", description: "a rule" },
    ]);

    expect(output.at("print")).toEqual([
      "cursor  .cursor/rules/a.mdc",
      "  a rule",
      "  applies to: every file",
    ]);
  });

  it("names an empty description rather than printing a bare indent", () => {
    const output = new CapturingOutput(false);

    printInstalledRules(output, [
      { tool: "claude", path: ".claude/rules/a.md", name: "a", description: "", paths: [] },
    ]);

    expect(output.at("print")).toEqual([
      "claude  .claude/rules/a.md",
      "  (no description)",
      "  applies to: ",
    ]);
  });
});
