import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePluginCliError } from "../../../src/domain/errors.js";
import { ClaudeCliAdapter } from "../../../src/infrastructure/adapters/claude-cli-adapter.js";

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

// Measured on #703: a project's `.claude/settings.json` can declare
// `extraKnownMarketplaces`/`enabledPlugins` correctly and `claude -p` will still drop
// it as "orphaned" — the runtime only loads what's in its own user-global registry
// (`~/.claude/plugins/known_marketplaces.json`, `installed_plugins.json`), which only
// `claude plugin marketplace add` / `claude plugin install` populate. These commands
// are the ones proven, in a throwaway project, to make that registry match and a
// headless session resolve the plugin's skill.
describe("ClaudeCliAdapter", () => {
  let restorePath: (() => void) | undefined;
  afterEach(() => {
    restorePath?.();
    restorePath = undefined;
  });

  it("reports available when the claude binary is on PATH (no spawn)", () => {
    const env = pathWithExecutable("claude");
    restorePath = env.restore;

    expect(new ClaudeCliAdapter().isAvailable()).toBe(true);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("reports unavailable when the claude binary is not on PATH", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "aidd-empty-"));
    const prev = process.env.PATH;
    process.env.PATH = emptyDir;
    restorePath = () => {
      process.env.PATH = prev;
      rmSync(emptyDir, { recursive: true, force: true });
    };

    expect(new ClaudeCliAdapter().isAvailable()).toBe(false);
  });

  it("registers a project-scoped marketplace via `claude plugin marketplace add`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new ClaudeCliAdapter().addMarketplace("/abs/mkt");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "claude",
      ["plugin", "marketplace", "add", "--scope", "project", "/abs/mkt"],
      expect.anything()
    );
  });

  it("upgrades marketplaces via `claude plugin marketplace update`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new ClaudeCliAdapter().upgradeMarketplaces();

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "claude",
      ["plugin", "marketplace", "update"],
      expect.anything()
    );
  });

  it("enables a plugin via `claude plugin install <ref> --scope project --yes`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new ClaudeCliAdapter().enablePlugin("aidd-context@aidd-framework");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "claude",
      ["plugin", "install", "aidd-context@aidd-framework", "--scope", "project", "--yes"],
      expect.anything()
    );
  });

  it("throws NativePluginCliError with stderr detail on non-zero exit", () => {
    mockSpawnSync.mockReturnValue(
      makeResult({ status: 1, stderr: "plugin `ghost` was not found in marketplace `m1`" })
    );

    expect(() => new ClaudeCliAdapter().enablePlugin("ghost@m1")).toThrow(NativePluginCliError);
    expect(() => new ClaudeCliAdapter().enablePlugin("ghost@m1")).toThrow(
      "plugin `ghost` was not found"
    );
  });

  it("uninstalls a plugin via `claude plugin uninstall <ref> --scope project --yes`", () => {
    mockSpawnSync.mockReturnValue(makeResult({}));

    new ClaudeCliAdapter().uninstallPlugin("aidd-telemetry@aidd-framework");

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "claude",
      ["plugin", "uninstall", "aidd-telemetry@aidd-framework", "--scope", "project", "--yes"],
      expect.anything()
    );
  });

  it("throws NativePluginCliError when uninstalling an already-absent plugin", () => {
    mockSpawnSync.mockReturnValue(
      makeResult({ status: 1, stderr: "plugin `ghost` is not installed" })
    );

    expect(() => new ClaudeCliAdapter().uninstallPlugin("ghost@m1")).toThrow(NativePluginCliError);
  });

  it("throws NativePluginCliError when the process fails to spawn", () => {
    mockSpawnSync.mockReturnValue(makeResult({ error: new Error("spawn EACCES"), status: null }));

    expect(() => new ClaudeCliAdapter().addMarketplace("/abs/mkt")).toThrow(NativePluginCliError);
  });
});
