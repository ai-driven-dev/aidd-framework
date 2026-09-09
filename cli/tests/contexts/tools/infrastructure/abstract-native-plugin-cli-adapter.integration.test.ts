import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { windowsCommandLine } from "../../../../src/contexts/tools/infrastructure/executable-on-path.js";
import {
  NativePluginCliAdapter,
  type NativePluginCliShape,
} from "../../../../src/contexts/tools/infrastructure/native-plugin-cli-adapter.js";
import { NativePluginCliError } from "../../../../src/kernel/errors.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

const mockSpawnSync = vi.mocked(spawnSync);

function makeResult(overrides: Partial<ReturnType<typeof spawnSync>>) {
  return {
    pid: 1,
    output: [],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
    error: undefined,
    ...overrides,
  } as ReturnType<typeof spawnSync>;
}

const RUN_OPTIONS = { timeout: 120000, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" };
const PROBE_OPTIONS = { timeout: 120000, stdio: ["ignore", "ignore", "ignore"], encoding: "utf-8" };

const FULL_SHAPE: NativePluginCliShape = {
  scopeArgs: { project: ["--scope", "local"], user: ["--scope", "user"] },
  forceRemoveArgs: ["--force"],
  sourceCheckVerb: "update",
  upgradeVerb: "update",
  enableVerb: "install",
  disableVerb: "uninstall",
  pluginArgs: ["--yes"],
};

function adapter(shape: NativePluginCliShape = FULL_SHAPE): NativePluginCliAdapter {
  return new NativePluginCliAdapter("probe-tool", shape);
}

afterEach(() => {
  mockSpawnSync.mockReset();
});

describe("registering and removing a marketplace through the tool's own CLI", () => {
  it("removes a marketplace by name at the scope asked for, and nothing more by default", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    adapter().removeMarketplace("aidd-framework", "user");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "probe-tool",
      ["plugin", "marketplace", "remove", "aidd-framework", "--scope", "user"],
      RUN_OPTIONS
    );
  });

  it("forces a removal past installed plugins only when asked, with the arguments the tool declares", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    adapter().removeMarketplace("aidd-framework", "project", { force: true });
    adapter().removeMarketplace("aidd-framework", "project", { force: false });

    expect(mockSpawnSync.mock.calls.map((call) => call[1])).toStrictEqual([
      ["plugin", "marketplace", "remove", "aidd-framework", "--scope", "local", "--force"],
      ["plugin", "marketplace", "remove", "aidd-framework", "--scope", "local"],
    ]);
  });

  it("forces nothing for a tool declaring no force arguments", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    adapter({}).removeMarketplace("aidd-framework", "project", { force: true });

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "probe-tool",
      ["plugin", "marketplace", "remove", "aidd-framework"],
      RUN_OPTIONS
    );
  });
});

describe("telling a live registration from a dead one", () => {
  it("answers unknown, without running anything, for a tool declaring no source check", () => {
    expect(adapter({}).registrationState("aidd-framework")).toBe("unknown");
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("answers live when the source check exits cleanly, asking only for its exit code", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    expect(adapter().registrationState("aidd-framework")).toBe("live");
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "probe-tool",
      ["plugin", "marketplace", "update", "aidd-framework"],
      PROBE_OPTIONS
    );
  });

  it("answers dead when the source check fails, or cannot be spawned at all", () => {
    mockSpawnSync.mockReturnValueOnce(makeResult({ status: 1 }));
    expect(adapter().registrationState("aidd-framework")).toBe("dead");

    mockSpawnSync.mockReturnValueOnce(makeResult({ error: new Error("ENOENT") }));
    expect(adapter().registrationState("aidd-framework")).toBe("dead");
  });
});

describe("driving the verbs a tool declares, and only those", () => {
  it("re-indexes marketplaces with the declared verb, and does nothing without one", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    adapter().upgradeMarketplaces();
    adapter({}).upgradeMarketplaces();

    expect(mockSpawnSync.mock.calls.map((call) => call[1])).toStrictEqual([
      ["plugin", "marketplace", "update"],
    ]);
  });

  it("enables and uninstalls a plugin with the declared verb, the plugin arguments and the scope", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    adapter().enablePlugin("p@m");
    adapter().uninstallPlugin("p@m", "user");

    expect(mockSpawnSync.mock.calls.map((call) => call[1])).toStrictEqual([
      ["plugin", "install", "p@m", "--yes", "--scope", "local"],
      ["plugin", "uninstall", "p@m", "--yes", "--scope", "user"],
    ]);
  });

  it("neither enables nor uninstalls for a tool that loads plugins from a file this CLI writes", () => {
    adapter({}).enablePlugin("p@m");
    adapter({}).uninstallPlugin("p@m");

    expect(adapter({}).enablesPlugins()).toBe(false);
    expect(adapter().enablesPlugins()).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});

describe("naming a failure by the tool, the step and what the tool said", () => {
  it("carries the spawn error's own message when the process never started", () => {
    mockSpawnSync.mockReturnValue(makeResult({ error: new Error("spawn ENOENT") }));

    expect(() => adapter().addMarketplace("/src", "project")).toThrow(
      new NativePluginCliError("probe-tool marketplace add /src failed: spawn ENOENT")
    );
  });

  it("carries the tool's trimmed stderr on a non-zero exit", () => {
    mockSpawnSync.mockReturnValue(makeResult({ status: 1, stderr: "  boom \n" }));

    expect(() => adapter().upgradeMarketplaces()).toThrow(
      new NativePluginCliError("probe-tool marketplace update failed: boom")
    );
  });

  it("names the exit code when the tool said nothing, and unknown when there is no code", () => {
    mockSpawnSync.mockReturnValueOnce(makeResult({ status: 2, stderr: "" }));
    expect(() => adapter().enablePlugin("p@m")).toThrow(
      new NativePluginCliError("probe-tool plugin install p@m failed: exited with code 2")
    );

    mockSpawnSync.mockReturnValueOnce(makeResult({ status: null, signal: "SIGKILL", stderr: "" }));
    expect(() => adapter().uninstallPlugin("p@m")).toThrow(
      new NativePluginCliError("probe-tool plugin uninstall p@m failed: exited with code unknown")
    );
  });

  it("names the marketplace removal that failed", () => {
    mockSpawnSync.mockReturnValue(makeResult({ status: 1, stderr: "not found" }));

    expect(() => adapter().removeMarketplace("m", "project")).toThrow(
      new NativePluginCliError("probe-tool marketplace remove m failed: not found")
    );
  });
});

describe("a batch shim on PATH", () => {
  let dir: string | undefined;
  const previousPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = previousPath;
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("runs through the command interpreter as one quoted command line", () => {
    dir = mkdtempSync(join(tmpdir(), "aidd-bin-"));
    writeFileSync(join(dir, "probe.cmd"), "#!/bin/sh\n", { mode: 0o755 });
    process.env.PATH = dir;
    mockSpawnSync.mockReturnValue(makeResult({}));

    new NativePluginCliAdapter("probe.cmd", FULL_SHAPE).addMarketplace("/my src", "project");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      windowsCommandLine(join(dir, "probe.cmd"), [
        "plugin",
        "marketplace",
        "add",
        "/my src",
        "--scope",
        "local",
      ]),
      { ...RUN_OPTIONS, shell: true }
    );
  });

  it("is what makes the tool available, while a bare name absent from PATH is not", () => {
    dir = mkdtempSync(join(tmpdir(), "aidd-bin-"));
    writeFileSync(join(dir, "probe.cmd"), "#!/bin/sh\n", { mode: 0o755 });
    process.env.PATH = dir;

    expect(new NativePluginCliAdapter("probe.cmd", FULL_SHAPE).isAvailable()).toBe(true);
    expect(adapter().isAvailable()).toBe(false);
  });
});
