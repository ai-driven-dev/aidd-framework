import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePluginCliError } from "../../../src/domain/errors.js";
import { CopilotCliAdapter } from "../../../src/infrastructure/adapters/copilot-cli-adapter.js";

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

describe("CopilotCliAdapter", () => {
  let restorePath: (() => void) | undefined;
  afterEach(() => {
    restorePath?.();
    restorePath = undefined;
  });

  it("reports available when the copilot binary is on PATH (no spawn)", () => {
    const dir = mkdtempSync(join(tmpdir(), "aidd-bin-"));
    writeFileSync(join(dir, "copilot"), "#!/bin/sh\n", { mode: 0o755 });
    const prev = process.env.PATH;
    process.env.PATH = dir;
    restorePath = () => {
      process.env.PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    };

    expect(new CopilotCliAdapter().isAvailable()).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("reports unavailable when the copilot binary is not on PATH", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "aidd-empty-"));
    const prev = process.env.PATH;
    process.env.PATH = emptyDir;
    restorePath = () => {
      process.env.PATH = prev;
      rmSync(emptyDir, { recursive: true, force: true });
    };

    expect(new CopilotCliAdapter().isAvailable()).toBe(false);
  });

  it("registers a marketplace via `copilot plugin marketplace add <source>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CopilotCliAdapter().addMarketplace("/abs/mkt");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "copilot",
      ["plugin", "marketplace", "add", "/abs/mkt"],
      expect.anything()
    );
  });

  it("refreshes marketplaces via `copilot plugin marketplace update`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CopilotCliAdapter().upgradeMarketplaces();

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "copilot",
      ["plugin", "marketplace", "update"],
      expect.anything()
    );
  });

  it("installs a plugin via `copilot plugin install <ref>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CopilotCliAdapter().enablePlugin("aidd-context@aidd-framework");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "copilot",
      ["plugin", "install", "aidd-context@aidd-framework"],
      expect.anything()
    );
  });

  it("throws NativePluginCliError with stderr detail on non-zero exit", () => {
    mockSpawnSync.mockReturnValue(makeResult({ status: 1, stderr: 'Marketplace "m1" not found' }));

    expect(() => new CopilotCliAdapter().enablePlugin("ghost@m1")).toThrow(NativePluginCliError);
    expect(() => new CopilotCliAdapter().enablePlugin("ghost@m1")).toThrow("Marketplace");
  });

  it("uninstalls a plugin via `copilot plugin uninstall <ref>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CopilotCliAdapter().uninstallPlugin("aidd-telemetry@aidd-framework");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "copilot",
      ["plugin", "uninstall", "aidd-telemetry@aidd-framework"],
      expect.anything()
    );
  });

  it("throws NativePluginCliError when uninstalling an already-absent plugin", () => {
    mockSpawnSync.mockReturnValue(makeResult({ status: 1, stderr: "Plugin not found" }));

    expect(() => new CopilotCliAdapter().uninstallPlugin("ghost@m1")).toThrow(NativePluginCliError);
  });

  it("throws NativePluginCliError when the process fails to spawn", () => {
    mockSpawnSync.mockReturnValue(makeResult({ error: new Error("spawn EACCES"), status: null }));

    expect(() => new CopilotCliAdapter().addMarketplace("/abs/mkt")).toThrow(NativePluginCliError);
  });
});
