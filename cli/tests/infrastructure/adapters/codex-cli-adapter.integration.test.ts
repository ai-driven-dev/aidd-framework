import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePluginCliError } from "../../../src/domain/errors.js";
import { CodexCliAdapter } from "../../../src/infrastructure/adapters/codex-cli-adapter.js";

function pathWithExecutable(name: string): { dir: string; restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "aidd-bin-"));
  writeFileSync(join(dir, name), "#!/bin/sh\n", { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = dir;
  return {
    dir,
    restore: () => {
      process.env.PATH = prev;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

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

describe("CodexCliAdapter", () => {
  let restorePath: (() => void) | undefined;
  afterEach(() => {
    restorePath?.();
    restorePath = undefined;
  });

  it("reports available when the codex binary is on PATH (no spawn)", () => {
    const env = pathWithExecutable("codex");
    restorePath = env.restore;

    expect(new CodexCliAdapter().isAvailable()).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("reports unavailable when the codex binary is not on PATH", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "aidd-empty-"));
    const prev = process.env.PATH;
    process.env.PATH = emptyDir;
    restorePath = () => {
      process.env.PATH = prev;
      rmSync(emptyDir, { recursive: true, force: true });
    };

    expect(new CodexCliAdapter().isAvailable()).toBe(false);
  });

  it("registers a marketplace via `codex plugin marketplace add <source>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CodexCliAdapter().addMarketplace("/abs/mkt");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "codex",
      ["plugin", "marketplace", "add", "/abs/mkt"],
      expect.anything()
    );
  });

  it("upgrades marketplaces via `codex plugin marketplace upgrade`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CodexCliAdapter().upgradeMarketplaces();

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "codex",
      ["plugin", "marketplace", "upgrade"],
      expect.anything()
    );
  });

  it("enables a plugin via `codex plugin add <ref>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CodexCliAdapter().enablePlugin("aidd-context@aidd-framework");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "codex",
      ["plugin", "add", "aidd-context@aidd-framework"],
      expect.anything()
    );
  });

  it("throws NativePluginCliError with stderr detail on non-zero exit", () => {
    mockSpawnSync.mockReturnValue(
      makeResult({ status: 1, stderr: "plugin `ghost` was not found in marketplace `m1`" })
    );

    expect(() => new CodexCliAdapter().enablePlugin("ghost@m1")).toThrow(NativePluginCliError);
    expect(() => new CodexCliAdapter().enablePlugin("ghost@m1")).toThrow(
      "plugin `ghost` was not found"
    );
  });

  it("uninstalls a plugin via `codex plugin remove <ref>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new CodexCliAdapter().uninstallPlugin("aidd-telemetry@aidd-framework");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "codex",
      ["plugin", "remove", "aidd-telemetry@aidd-framework"],
      expect.anything()
    );
  });

  it("throws NativePluginCliError when uninstalling an already-absent plugin", () => {
    mockSpawnSync.mockReturnValue(makeResult({ status: 1, stderr: "plugin `ghost` not found" }));

    expect(() => new CodexCliAdapter().uninstallPlugin("ghost@m1")).toThrow(NativePluginCliError);
  });

  it("throws NativePluginCliError when the process fails to spawn", () => {
    mockSpawnSync.mockReturnValue(makeResult({ error: new Error("spawn EACCES"), status: null }));

    expect(() => new CodexCliAdapter().addMarketplace("/abs/mkt")).toThrow(NativePluginCliError);
  });
});
