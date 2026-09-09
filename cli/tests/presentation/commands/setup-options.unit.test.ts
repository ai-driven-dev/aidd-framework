import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_TOOL_IDS, IDE_TOOL_IDS } from "../../../src/kernel/tool.js";
import {
  expandAllKeyword,
  parsePluginsFlag,
  parseSourceFlag,
  parseToolIds,
} from "../../../src/presentation/commands/setup.js";
import { ErrorHandler } from "../../../src/presentation/error-handler.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

function refuseByThrowing() {
  return vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit");
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseSourceFlag", () => {
  it("chooses no source at all when --source was not given", () => {
    const output = new CapturingOutput(false);

    expect(parseSourceFlag({}, output)).toBeUndefined();
  });

  it("carries the release tag into a remote source", () => {
    const output = new CapturingOutput(false);

    const source = parseSourceFlag({ source: "remote", release: "v1.2.3" }, output);

    expect(source?.kind).toBe("remote");
    expect(source?.ref).toBe("v1.2.3");
  });

  it("resolves a local source's path against the working directory", () => {
    const output = new CapturingOutput(false);

    const source = parseSourceFlag({ source: "local", path: "./framework" }, output);

    expect(source?.kind).toBe("local");
    expect(source?.path).toBe(resolve("./framework"));
  });

  it("refuses a local source with no --path, naming the flag it needs", () => {
    const output = new CapturingOutput(false);
    const exit = refuseByThrowing();

    expect(() => parseSourceFlag({ source: "local" }, output)).toThrow("process.exit");

    expect(output.at("error")).toEqual(["--source local requires --path <dir>"]);
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("expandAllKeyword", () => {
  it("selects nothing when the flag was not given", () => {
    expect(expandAllKeyword(undefined, AI_TOOL_IDS)).toEqual([]);
  });

  it("expands 'all' into every id of that category, spacing and all", () => {
    expect(expandAllKeyword("all", IDE_TOOL_IDS)).toEqual([...IDE_TOOL_IDS]);
    expect(expandAllKeyword("  all  ", IDE_TOOL_IDS)).toEqual([...IDE_TOOL_IDS]);
  });

  it("splits a comma-separated list, dropping the spacing and the empty entries", () => {
    expect(expandAllKeyword(" claude , , cursor ", AI_TOOL_IDS)).toEqual(["claude", "cursor"]);
  });
});

describe("parseToolIds", () => {
  it("selects no tool at all when neither category was given", () => {
    const errorHandler = new ErrorHandler(new CapturingOutput(false));

    expect(parseToolIds({}, errorHandler)).toEqual({ aiTools: [], ideTools: [] });
  });

  it("splits the ids given per category", () => {
    const errorHandler = new ErrorHandler(new CapturingOutput(false));

    expect(parseToolIds({ ai: "claude", ide: "vscode" }, errorHandler)).toEqual({
      aiTools: ["claude"],
      ideTools: ["vscode"],
    });
  });

  it("refuses an id belonging to the other category", () => {
    const output = new CapturingOutput(false);
    const exit = refuseByThrowing();

    expect(() => parseToolIds({ ai: "vscode" }, new ErrorHandler(output))).toThrow("process.exit");

    expect(exit).toHaveBeenCalledWith(1);
    expect(output.at("error")).toHaveLength(1);
  });

  it("refuses an AI id given as an IDE one", () => {
    const output = new CapturingOutput(false);
    const exit = refuseByThrowing();

    expect(() => parseToolIds({ ide: "claude" }, new ErrorHandler(output))).toThrow("process.exit");

    expect(exit).toHaveBeenCalledWith(1);
    expect(output.at("error")).toHaveLength(1);
  });

  it("accepts 'all' without checking it against the category", () => {
    const errorHandler = new ErrorHandler(new CapturingOutput(false));

    expect(parseToolIds({ ai: "all" }, errorHandler)).toEqual({
      aiTools: [...AI_TOOL_IDS],
      ideTools: [],
    });
  });
});

describe("parsePluginsFlag", () => {
  it("asks on a terminal when --plugins was not given", () => {
    expect(parsePluginsFlag(undefined, true)).toEqual({ mode: "interactive", names: [] });
  });

  it("installs nothing off a terminal when --plugins was not given", () => {
    expect(parsePluginsFlag(undefined, false)).toEqual({ mode: "none", names: [] });
  });

  it("reads each of the three keywords as its own mode, spacing and all", () => {
    expect(parsePluginsFlag("  none  ", true)).toEqual({ mode: "none", names: [] });
    expect(parsePluginsFlag("all", true)).toEqual({ mode: "all", names: [] });
    expect(parsePluginsFlag("recommended", true)).toEqual({ mode: "recommended", names: [] });
  });

  it("reads anything else as the names to install", () => {
    expect(parsePluginsFlag(" aidd-dev , aidd-pm ,", true)).toEqual({
      mode: "named",
      names: ["aidd-dev", "aidd-pm"],
    });
  });
});
