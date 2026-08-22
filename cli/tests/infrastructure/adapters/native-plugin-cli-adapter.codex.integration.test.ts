import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePluginCliError } from "../../../src/domain/errors.js";
import { NativePluginCliAdapter } from "../../../src/infrastructure/adapters/native-plugin-cli-adapter.js";

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

    expect(
      new NativePluginCliAdapter("codex", {
        upgradeVerb: "upgrade",
        enableVerb: "add",
      }).isAvailable()
    ).toBe(true);
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

    expect(
      new NativePluginCliAdapter("codex", {
        upgradeVerb: "upgrade",
        enableVerb: "add",
      }).isAvailable()
    ).toBe(false);
  });

  it("registers a marketplace via `codex plugin marketplace add <source>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new NativePluginCliAdapter("codex", {
      upgradeVerb: "upgrade",
      enableVerb: "add",
    }).addMarketplace("/abs/mkt", "project");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "codex",
      ["plugin", "marketplace", "add", "/abs/mkt"],
      expect.anything()
    );
  });

  it("upgrades marketplaces via `codex plugin marketplace upgrade`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new NativePluginCliAdapter("codex", {
      upgradeVerb: "upgrade",
      enableVerb: "add",
    }).upgradeMarketplaces();

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "codex",
      ["plugin", "marketplace", "upgrade"],
      expect.anything()
    );
  });

  it("enables a plugin via `codex plugin add <ref>`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new NativePluginCliAdapter("codex", { upgradeVerb: "upgrade", enableVerb: "add" }).enablePlugin(
      "aidd-context@aidd-framework"
    );

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

    expect(() =>
      new NativePluginCliAdapter("codex", {
        upgradeVerb: "upgrade",
        enableVerb: "add",
      }).enablePlugin("ghost@m1")
    ).toThrow(NativePluginCliError);
    expect(() =>
      new NativePluginCliAdapter("codex", {
        upgradeVerb: "upgrade",
        enableVerb: "add",
      }).enablePlugin("ghost@m1")
    ).toThrow("plugin `ghost` was not found");
  });

  it("throws NativePluginCliError when the process fails to spawn", () => {
    mockSpawnSync.mockReturnValue(makeResult({ error: new Error("spawn EACCES"), status: null }));

    expect(() =>
      new NativePluginCliAdapter("codex", {
        upgradeVerb: "upgrade",
        enableVerb: "add",
      }).addMarketplace("/abs/mkt", "project")
    ).toThrow(NativePluginCliError);
  });
});
