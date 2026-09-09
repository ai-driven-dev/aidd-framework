import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { GhCliAdapter } from "../../../src/runtime/auth/gh-cli-adapter.js";

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

describe("GhCliAdapter", () => {
  it("returns the token when gh auth token succeeds", () => {
    mockSpawnSync.mockReturnValue(makeResult({ stdout: "ghp_abc123\n" }));

    expect(new GhCliAdapter().resolve()).toBe("ghp_abc123");
  });

  it("returns null when gh is not installed (ENOENT)", () => {
    mockSpawnSync.mockReturnValue(makeResult({ error: new Error("ENOENT"), status: null }));

    expect(new GhCliAdapter().resolve()).toBeNull();
  });

  it("returns null when gh auth token exits 0 with empty output", () => {
    mockSpawnSync.mockReturnValue(makeResult({ stdout: "   " }));

    expect(new GhCliAdapter().resolve()).toBeNull();
  });

  it("throws with stderr when gh auth token exits non-zero", () => {
    mockSpawnSync.mockReturnValue(
      makeResult({
        status: 1,
        stderr: "not logged in to any GitHub hosts. Run gh auth login to authenticate.",
      })
    );

    expect(() => new GhCliAdapter().resolve()).toThrow(
      "gh auth token failed: not logged in to any GitHub hosts"
    );
  });

  it("throws with exit code when gh auth token exits non-zero with no stderr", () => {
    mockSpawnSync.mockReturnValue(makeResult({ status: 1, stderr: "" }));

    expect(() => new GhCliAdapter().resolve()).toThrow("exited with code 1");
  });

  it("throws an upgrade hint when gh is too old and does not support the token subcommand", () => {
    mockSpawnSync.mockReturnValue(
      makeResult({
        status: 1,
        stderr: 'unknown command "token" for "gh auth"',
      })
    );

    expect(() => new GhCliAdapter().resolve()).toThrow("gh CLI is too old to support");
  });
});
