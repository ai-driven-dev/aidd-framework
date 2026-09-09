import { describe, expect, it } from "vitest";
import {
  printDetectedContext,
  printNextSteps,
  printSetupOutcome,
  printWelcomeBanner,
} from "../../../src/presentation/display/setup-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

const CLAUDE_INSTALLED = {
  toolId: "claude",
  fileCount: 2,
  files: [{ relativePath: "skills/plan.md" }, { relativePath: "skills/test.md" }],
  skipped: false,
  warnings: [],
};

describe("printWelcomeBanner", () => {
  it("frames the run between two blank lines and names what it is about to wire", () => {
    const output = new CapturingOutput(false);

    printWelcomeBanner(output);

    expect(output.lines).toEqual([
      "",
      "AI-Driven Development setup",
      "Wires your AI tools, registers the framework marketplace, installs plugins.",
      "Press Ctrl-C any time to abort.",
      "",
    ]);
  });
});

describe("printNextSteps", () => {
  it("offers doctor first when something was installed", () => {
    const output = new CapturingOutput(false);

    printNextSteps(output, true);

    expect(output.lines).toEqual([
      "",
      "Next steps:",
      "  aidd doctor             # verify drift",
      "  aidd marketplace list   # see registered marketplaces",
      "  aidd plugin install     # add plugins",
      "  aidd --help             # explore commands",
    ]);
  });

  it("leaves doctor out when nothing was installed", () => {
    const output = new CapturingOutput(false);

    printNextSteps(output, false);

    expect(output.lines).toEqual([
      "",
      "Next steps:",
      "  aidd marketplace list   # see registered marketplaces",
      "  aidd plugin install     # add plugins",
      "  aidd --help             # explore commands",
    ]);
  });
});

describe("printDetectedContext", () => {
  it("names what the project was detected as, ended by a full stop", () => {
    const output = new CapturingOutput(false);

    printDetectedContext(output, "a TypeScript project");

    expect(output.at("info")).toEqual(["Detected: a TypeScript project."]);
  });
});

describe("printSetupOutcome", () => {
  it("announces a first install as initialized", () => {
    const output = new CapturingOutput(false);

    printSetupOutcome(output, { kind: "initialized", install: { results: [] } }, false);

    expect(output.at("success")).toEqual(["Project initialized."]);
  });

  it("announces a repeat run as up to date, on the info channel", () => {
    const output = new CapturingOutput(false);

    printSetupOutcome(output, { kind: "up-to-date", install: { results: [] } }, false);

    expect(output.at("info")).toEqual(["Project is up to date."]);
    expect(output.at("success")).toEqual([]);
  });

  it("warns about a tool already installed rather than counting it as installed", () => {
    const output = new CapturingOutput(false);

    printSetupOutcome(
      output,
      {
        kind: "up-to-date",
        install: { results: [{ ...CLAUDE_INSTALLED, skipped: true }] },
      },
      false
    );

    expect(output.lines).toEqual(["Project is up to date.", "claude is already installed."]);
  });

  it("surfaces each installed tool's own warnings", () => {
    const output = new CapturingOutput(false);

    printSetupOutcome(
      output,
      {
        kind: "initialized",
        install: { results: [{ ...CLAUDE_INSTALLED, warnings: ["settings.json was merged"] }] },
      },
      false
    );

    expect(output.at("warn")).toEqual(["settings.json was merged"]);
  });

  it("counts one installed tool and its files", () => {
    const output = new CapturingOutput(false);

    printSetupOutcome(
      output,
      { kind: "initialized", install: { results: [CLAUDE_INSTALLED] } },
      false
    );

    expect(output.at("success")).toEqual(["Project initialized.", "Installed claude (2 files)"]);
    expect(output.at("debug")).toEqual([]);
  });

  it("names every installed tool and totals their files", () => {
    const output = new CapturingOutput(false);

    printSetupOutcome(
      output,
      {
        kind: "initialized",
        install: {
          results: [
            CLAUDE_INSTALLED,
            { ...CLAUDE_INSTALLED, toolId: "cursor", fileCount: 3, files: [] },
          ],
        },
      },
      false
    );

    expect(output.at("success")).toEqual([
      "Project initialized.",
      "Installed claude, cursor (5 files)",
    ]);
  });

  it("lists every written file only when verbose", () => {
    const output = new CapturingOutput(false);

    printSetupOutcome(
      output,
      { kind: "initialized", install: { results: [CLAUDE_INSTALLED] } },
      true
    );

    expect(output.at("debug")).toEqual([
      "Tool: claude",
      "  + skills/plan.md",
      "  + skills/test.md",
    ]);
  });
});
