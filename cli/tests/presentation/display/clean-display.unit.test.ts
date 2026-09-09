import { describe, expect, it } from "vitest";
import {
  printProjectCleanOutcome,
  printUserScopeCleanOutcome,
} from "../../../src/presentation/display/clean-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

const NO_PREVIEW = { tools: [], nativeRegistrations: [], totalFileCount: 0 };

describe("printProjectCleanOutcome", () => {
  it("says nothing is there to clean when no manifest was found", () => {
    const output = new CapturingOutput(false);

    printProjectCleanOutcome(
      output,
      { manifestFound: false, dryRun: false, preview: NO_PREVIEW, fileCount: 0 },
      false
    );

    expect(output.at("success")).toEqual(["Nothing to clean"]);
  });

  it("counts the files removed once the run was forced", () => {
    const output = new CapturingOutput(false);

    printProjectCleanOutcome(
      output,
      { manifestFound: true, dryRun: false, preview: NO_PREVIEW, fileCount: 12 },
      false
    );

    expect(output.at("success")).toEqual(["Cleaned all AIDD files (12 files removed)"]);
  });

  it("names every tool, the manifest, and each registration a forced run would undo", () => {
    const output = new CapturingOutput(false);

    printProjectCleanOutcome(
      output,
      {
        manifestFound: true,
        dryRun: true,
        preview: {
          tools: [
            { toolId: "claude", fileCount: 3 },
            { toolId: "cursor", fileCount: 1 },
          ],
          nativeRegistrations: [
            {
              toolId: "claude",
              binary: "claude",
              pluginRefCount: 2,
              marketplaceCount: 1,
              cachePaths: ["/home/me/.claude/plugins/cache"],
            },
          ],
          totalFileCount: 4,
        },
        fileCount: 0,
      },
      true
    );

    expect(output.lines).toEqual([
      "The following will be removed:",
      "  claude: 3 files",
      "  cursor: 1 files",
      "  manifest: .aidd/ (config.json, if present, is kept)",
      "  claude: claude will be asked to unregister 2 plugin ref(s) and 1 marketplace(s)",
      "    cache to purge once unregistered: /home/me/.claude/plugins/cache",
      "No files removed.",
    ]);
  });

  it("names the other projects still holding the shared source", () => {
    const output = new CapturingOutput(false);

    printProjectCleanOutcome(
      output,
      {
        manifestFound: true,
        dryRun: true,
        preview: { ...NO_PREVIEW, sharedSourceOtherProjects: ["/a", "/b"] },
        fileCount: 0,
      },
      true
    );

    expect(output.lines).toEqual([
      "The following will be removed:",
      "  manifest: .aidd/ (config.json, if present, is kept)",
      "  aidd-framework: shared source, still referenced by: /a, /b",
      "No files removed.",
    ]);
  });

  it("says no other project holds the shared source when the list is empty", () => {
    const output = new CapturingOutput(false);

    printProjectCleanOutcome(
      output,
      {
        manifestFound: true,
        dryRun: true,
        preview: { ...NO_PREVIEW, sharedSourceOtherProjects: [] },
        fileCount: 0,
      },
      true
    );

    expect(output.lines).toContain(
      "  aidd-framework: shared source, still referenced by: no other project"
    );
  });

  it("asks for --force in the singular off a terminal", () => {
    const output = new CapturingOutput(false);

    printProjectCleanOutcome(
      output,
      {
        manifestFound: true,
        dryRun: true,
        preview: {
          tools: [{ toolId: "claude", fileCount: 1 }],
          nativeRegistrations: [],
          totalFileCount: 1,
        },
        fileCount: 0,
      },
      false
    );

    expect(output.at("success")).toEqual([
      "Would remove 1 file across 1 tool. Use --force to confirm.",
    ]);
  });

  it("asks for --force in the plural off a terminal", () => {
    const output = new CapturingOutput(false);

    printProjectCleanOutcome(
      output,
      {
        manifestFound: true,
        dryRun: true,
        preview: {
          tools: [
            { toolId: "claude", fileCount: 1 },
            { toolId: "cursor", fileCount: 1 },
          ],
          nativeRegistrations: [],
          totalFileCount: 2,
        },
        fileCount: 0,
      },
      false
    );

    expect(output.at("success")).toEqual([
      "Would remove 2 files across 2 tools. Use --force to confirm.",
    ]);
  });
});

describe("printUserScopeCleanOutcome", () => {
  it("names each tool, the built versions and the referencing projects before removing anything", () => {
    const output = new CapturingOutput(false);

    printUserScopeCleanOutcome(
      output,
      {
        dryRun: true,
        manifestFound: true,
        preview: {
          toolIds: ["claude", "codex"],
          builtVersions: ["7.0.0", "7.1.0"],
          referencingProjects: ["/work/api", "/work/web"],
        },
      },
      true
    );

    expect(output.lines).toEqual([
      "The following will be removed for this machine:",
      "  claude: registration will be undone through its own CLI",
      "  codex: registration will be undone through its own CLI",
      "  aidd-framework: shared source (versions: 7.0.0, 7.1.0)",
      "  still referenced by: /work/api, /work/web",
      "No files removed.",
    ]);
  });

  it("reports nothing built and no other project when both lists are empty", () => {
    const output = new CapturingOutput(false);

    printUserScopeCleanOutcome(
      output,
      {
        dryRun: true,
        manifestFound: true,
        preview: { toolIds: [], builtVersions: [], referencingProjects: [] },
      },
      false
    );

    expect(output.lines).toEqual([
      "The following will be removed for this machine:",
      "  aidd-framework: shared source (versions: none built yet)",
      "  still referenced by: no other project",
      "Use --force to confirm.",
    ]);
  });

  it("names the machine-local purge alone when no user-scope manifest was there", () => {
    const output = new CapturingOutput(false);

    printUserScopeCleanOutcome(
      output,
      {
        dryRun: false,
        manifestFound: false,
        preview: { toolIds: [], builtVersions: [], referencingProjects: [] },
      },
      false
    );

    expect(output.at("success")).toEqual([
      "Purged the shared aidd-framework source's machine-local state",
    ]);
  });

  it("confirms the shared source was cleaned when a manifest was there", () => {
    const output = new CapturingOutput(false);

    printUserScopeCleanOutcome(
      output,
      {
        dryRun: false,
        manifestFound: true,
        preview: { toolIds: [], builtVersions: [], referencingProjects: [] },
      },
      false
    );

    expect(output.at("success")).toEqual([
      "Cleaned the shared aidd-framework source for this machine",
    ]);
  });
});
