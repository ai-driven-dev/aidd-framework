import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePluginSourceShorthand } from "../../../src/kernel/source.js";

const marketplaceAdd = vi.fn();
const marketplaceList = vi.fn();
const marketplaceRemove = vi.fn();
const marketplaceRefresh = vi.fn();
const marketplaceCheck = vi.fn();
const activation = vi.fn();
const promptInput = vi.fn();
const menuSelect = vi.fn();
const spawn = vi.fn();

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    marketplaceAddUseCase: { execute: marketplaceAdd },
    marketplaceListUseCase: { execute: marketplaceList },
    marketplaceRemoveUseCase: { execute: marketplaceRemove },
    marketplaceRefreshUseCase: { execute: marketplaceRefresh },
    marketplaceCheckUseCase: { execute: marketplaceCheck },
    marketplaceSyncSettingsUseCase: { execute: activation },
    prompter: { input: promptInput },
  })),
  createMenuDeps: vi.fn(() => ({ prompter: { select: menuSelect } })),
}));

vi.mock("../../../src/presentation/commands/spawn-cli-command.js", () => ({
  spawnCliCommand: spawn,
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerMarketplaceCommand } = await import(
  "../../../src/presentation/commands/marketplace.js"
);

const PROJECT_ROOT = process.cwd();

let written: string[] = [];
let errors: string[] = [];

function pretendTerminal(isTTY: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", { value: isTTY, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  written = [];
  errors = [];
  pretendTerminal(false);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errors.push(String(chunk));
    return true;
  });
  marketplaceAdd.mockResolvedValue({ marketplace: { name: "market-b" } });
  marketplaceList.mockResolvedValue({ marketplaces: [], catalogs: undefined });
  marketplaceRemove.mockResolvedValue({
    marketplace: { name: "market-b" },
    removedPluginCount: 2,
  });
  marketplaceRefresh.mockResolvedValue({
    results: [{ name: "market-b", status: "refreshed" }],
    failedCount: 0,
  });
  marketplaceCheck.mockResolvedValue({ stale: [], upstreamRemoved: [], skipped: [] });
  activation.mockResolvedValue({ binaryMissing: [], errors: [] });
  promptInput.mockResolvedValueOnce("asked-name").mockResolvedValueOnce("asked/source");
  menuSelect.mockResolvedValue("list");
  spawn.mockResolvedValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  program.option("--verbose");
  registerMarketplaceCommand(program);
  await program.parseAsync(["node", "aidd", "marketplace", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

describe("aidd marketplace — the group with no subcommand", () => {
  it("offers the five things a person can do, then re-runs itself with the pick", async () => {
    pretendTerminal(true);

    await run();

    expect(menuSelect).toHaveBeenCalledWith("marketplace: what do you want to do?", [
      { name: "List marketplaces", value: "list" },
      { name: "Add marketplace", value: "add" },
      { name: "Refresh marketplaces", value: "refresh" },
      { name: "Remove marketplace", value: "remove", description: "requires name arg" },
      { name: "Check marketplaces", value: "check" },
    ]);
    expect(spawn).toHaveBeenCalledWith(["marketplace", "list"]);
  });

  it("prints its own help off a terminal rather than asking a question nobody can answer", async () => {
    await expect(run()).rejects.toThrow("(outputHelp)");

    expect(written.join("").split("\n")[0]).toBe("Usage: aidd marketplace [options] [command]");
    expect(menuSelect).not.toHaveBeenCalled();
  });
});

describe("aidd marketplace add", () => {
  it("registers at project scope by default, then activates that marketplace alone", async () => {
    expect(await run("add", "market-b", "/some/source")).toEqual([
      "Marketplace 'market-b' registered.",
    ]);
    expect(marketplaceAdd).toHaveBeenCalledWith({
      source: parsePluginSourceShorthand("/some/source"),
      name: "market-b",
      scope: "project",
      projectRoot: PROJECT_ROOT,
      autoTrust: false,
      overwrite: false,
    });
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      marketplaceNames: ["market-b"],
    });
  });

  it("registers machine-wide when the scope says user", async () => {
    await run("add", "market-b", "/some/source", "--scope", "user");

    expect(marketplaceAdd).toHaveBeenCalledWith(expect.objectContaining({ scope: "user" }));
  });

  it("carries a skipped prompt and an allowed replacement through", async () => {
    await run("add", "market-b", "/some/source", "--yes", "--overwrite");

    expect(marketplaceAdd).toHaveBeenCalledWith(
      expect.objectContaining({ autoTrust: true, overwrite: true })
    );
  });

  it("hands the given token to the composition root, where every fetcher reads it", async () => {
    await run("add", "market-b", "/some/source", "--token", "ghp_x");

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: false, token: "ghp_x" },
      expect.anything()
    );
    expect(process.env.AIDD_TOKEN).not.toBe("ghp_x");
  });

  it("asks for the name and the source it was not given, on a terminal", async () => {
    pretendTerminal(true);

    await run("add");

    expect(promptInput.mock.calls).toEqual([
      ["Marketplace name:"],
      ["Source (path or user/repo):"],
    ]);
    expect(marketplaceAdd).toHaveBeenCalledWith(expect.objectContaining({ name: "asked-name" }));
  });

  it("refuses to guess a name or a source off a terminal", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("add", "market-b")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: name and source are required in non-interactive mode.\n");
    expect(exit).toHaveBeenCalledWith(1);
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("refuses a scope that is neither project nor user", async () => {
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("add", "market-b", "/some/source", "--scope", "machine")).rejects.toThrow(
      "exited"
    );

    expect(errors[0]).toBe("Error: Invalid --scope 'machine'. Expected 'project' or 'user'.\n");
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });
});

it("hands no token when none was given", async () => {
  await run("add", "market-b", "/some/source");

  expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
    PROJECT_ROOT,
    { verbose: false, token: undefined },
    expect.anything()
  );
});

it("names a failed registration on stderr and fails the process", async () => {
  marketplaceAdd.mockRejectedValue(new Error("source is untrusted"));
  const exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exited");
  });

  await expect(run("add", "market-b", "/some/source")).rejects.toThrow("exited");

  expect(errors.join("")).toBe("Error: source is untrusted\n");
  expect(exit).toHaveBeenCalledWith(1);
});
describe("aidd marketplace list", () => {
  it("leaves the catalogs unfetched unless they were asked for", async () => {
    expect(await run("list")).toEqual(["No marketplaces registered."]);
    expect(marketplaceList).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      withCatalogs: false,
    });
  });

  it("fetches every catalog when the plugins were asked for", async () => {
    marketplaceList.mockResolvedValue({
      marketplaces: [{ name: "market-b", version: "1.2.3", scope: "project" }],
      catalogs: new Map(),
    });

    expect(await run("list", "--plugins")).toEqual(["market-b v1.2.3 [project]"]);
    expect(marketplaceList).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      withCatalogs: true,
    });
    expect(errors.join("")).toBe("Warning:   (could not fetch catalog for 'market-b')\n");
  });
});

describe("aidd marketplace — a failed read or removal", () => {
  it("names a failed listing on stderr and fails the process", async () => {
    marketplaceList.mockRejectedValue(new Error("registry is unreadable"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("list")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: registry is unreadable\n");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("names a failed removal on stderr and fails the process", async () => {
    marketplaceRemove.mockRejectedValue(new Error("marketplace is unknown"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("remove", "market-b")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: marketplace is unknown\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd marketplace remove", () => {
  it("removes the named one, re-drives every activation, and counts what went with it", async () => {
    expect(await run("remove", "market-b")).toEqual([
      "Marketplace 'market-b' removed (2 plugin(s) cleaned up).",
    ]);
    expect(marketplaceRemove).toHaveBeenCalledWith({
      name: "market-b",
      projectRoot: PROJECT_ROOT,
      autoConfirm: false,
    });
    expect(activation).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      marketplaceNames: undefined,
    });
  });

  it("carries a skipped orphan prompt through", async () => {
    await run("remove", "market-b", "--yes");

    expect(marketplaceRemove).toHaveBeenCalledWith(expect.objectContaining({ autoConfirm: true }));
  });
});

describe("aidd marketplace refresh", () => {
  it("refreshes every registered marketplace when none was named", async () => {
    expect(await run("refresh")).toEqual(["market-b: refreshed"]);
    expect(marketplaceRefresh).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      name: undefined,
      force: undefined,
    });
  });

  it("narrows to one name and clears the cache when forced", async () => {
    await run("refresh", "market-b", "--force");

    expect(marketplaceRefresh).toHaveBeenCalledWith({
      projectRoot: PROJECT_ROOT,
      name: "market-b",
      force: true,
    });
  });

  it("reports what each one did and fails the process when any failed", async () => {
    marketplaceRefresh.mockResolvedValue({
      results: [{ name: "market-b", status: "failed", error: "404" }],
      failedCount: 1,
    });
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("refresh")).rejects.toThrow("exited");

    expect(written.join("")).toBe("market-b: failed (404)\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd marketplace check", () => {
  it("asks about this project alone, and says so when nothing is stale", async () => {
    expect(await run("check")).toEqual(["All marketplaces fresh."]);
    expect(marketplaceCheck).toHaveBeenCalledWith({ projectRoot: PROJECT_ROOT });
  });
});

describe("aidd marketplace — how every subcommand builds its graph and reports a failure", () => {
  it.each([
    ["add", "market-b", "/some/source"],
    ["list"],
    ["remove", "market-b"],
    ["refresh"],
    ["check"],
  ])("hands %j this run's verbosity, never an empty option set", async (...args) => {
    await run(...args);

    expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
      PROJECT_ROOT,
      { verbose: false },
      expect.anything()
    );
  });

  it("names a failed check on stderr and fails the process", async () => {
    marketplaceCheck.mockRejectedValue(new Error("catalog unreachable"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exited");
    });

    await expect(run("check")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: catalog unreachable\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd marketplace — the help surface", () => {
  function marketplaceCommand(): Command {
    const program = new Command();
    registerMarketplaceCommand(program);
    const marketplace = program.commands.find((command) => command.name() === "marketplace");
    if (marketplace === undefined) throw new Error("marketplace command was not registered");
    return marketplace;
  }

  function optionsOf(name: string): [string, string | undefined, unknown][] {
    const child = marketplaceCommand().commands.find((candidate) => candidate.name() === name);
    if (child === undefined) throw new Error(`no subcommand ${name}`);
    return child.options.map((option) => [option.flags, option.description, option.defaultValue]);
  }

  it("describes the group and every subcommand, in the order they are registered", () => {
    expect(marketplaceCommand().description()).toBe("Manage plugin marketplaces");
    expect(
      marketplaceCommand().commands.map((command) => [
        command.name(),
        command.usage(),
        command.description(),
      ])
    ).toEqual([
      ["add", "[options] [name] [source]", "Register a plugin marketplace"],
      ["list", "[options]", "List registered plugin marketplaces"],
      ["remove", "[options] <name>", "Remove a registered plugin marketplace"],
      [
        "refresh",
        "[options] [name]",
        "Refresh registered marketplaces — re-fetches catalogs; see `framework update`, which moves installed tools to a new version instead",
      ],
      ["check", "[options]", "Report stale marketplaces and upstream-removed plugins"],
    ]);
  });

  it("says what add may be told, and which of it has a default", () => {
    expect(optionsOf("add")).toEqual([
      ["--scope <user|project>", "Registration scope (default: project)", "project"],
      ["--yes", "Skip the trust + cleanup prompts", undefined],
      ["--overwrite", "Replace an existing marketplace with the same name", undefined],
      ["--token <value>", "Auth token (host detected from source URL at fetch time)", undefined],
    ]);
  });

  it("says what list, remove and refresh each offer, and that check offers nothing", () => {
    expect(optionsOf("list")).toEqual([
      ["--plugins", "Also fetch and print all plugins from each marketplace catalog", undefined],
    ]);
    expect(optionsOf("remove")).toEqual([["--yes", "Skip the orphan-cleanup prompt", undefined]]);
    expect(optionsOf("refresh")).toEqual([
      ["--force", "Clear cache before re-fetching", undefined],
    ]);
    expect(optionsOf("check")).toEqual([]);
  });
});
