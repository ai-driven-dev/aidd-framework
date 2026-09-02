import { describe, expect, it, vi } from "vitest";

const mockEnvFn = vi.fn().mockReturnThis();
const mockCloneFn = vi.fn().mockResolvedValue(undefined);
const mockRawFn = vi.fn().mockResolvedValue(undefined);
const mockCheckoutFn = vi.fn().mockResolvedValue(undefined);

const mockGitInstance = {
  env: mockEnvFn,
  clone: mockCloneFn,
  raw: mockRawFn,
  checkout: mockCheckoutFn,
};

vi.mock("simple-git", () => ({
  simpleGit: vi.fn(() => mockGitInstance),
}));

const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    cb: (err: null, result: { stdout: string; stderr: string }) => void
  ) => {
    mockExecFile(cmd, args);
    cb(null, { stdout: "", stderr: "" });
  },
}));

import { PluginFetcherAdapter } from "../../../../src/contexts/distribution/infrastructure/plugin-fetcher-adapter.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

function makeAdapter(): PluginFetcherAdapter {
  const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
  return new PluginFetcherAdapter(fs);
}

describe("PluginFetcherAdapter — fail-fast git clone", () => {
  it("sets GIT_TERMINAL_PROMPT=0 on every clone to prevent interactive credential prompts", async () => {
    const adapter = makeAdapter();

    await adapter.fetch({ kind: "url", url: "https://example.com/repo.git" }, "/tmp/cache");

    expect(mockEnvFn).toHaveBeenCalledWith("GIT_TERMINAL_PROMPT", "0");
  });
});

describe("PluginFetcherAdapter — npm option-injection prevention", () => {
  it("passes -- before the package spec in pnpm add argv", async () => {
    mockExecFile.mockClear();
    const adapter = makeAdapter();

    // InMemoryFileAdapter has no node_modules dir, so execFile is invoked
    await adapter.fetch({ kind: "npm", package: "my-plugin", version: "1.0.0" }, "/cache");

    const argv: string[] = mockExecFile.mock.calls[0][1] as string[];
    const separatorIndex = argv.indexOf("--");
    const specIndex = argv.indexOf("my-plugin@1.0.0");
    expect(separatorIndex).toBeGreaterThanOrEqual(0);
    expect(specIndex).toBeGreaterThan(separatorIndex);
  });

  it("includes -- before a scoped package spec", async () => {
    mockExecFile.mockClear();
    const adapter = makeAdapter();

    await adapter.fetch({ kind: "npm", package: "@scope/my-plugin" }, "/cache");

    const argv: string[] = mockExecFile.mock.calls[0][1] as string[];
    const separatorIndex = argv.indexOf("--");
    expect(separatorIndex).toBeGreaterThanOrEqual(0);
    expect(argv[separatorIndex + 1]).toBe("@scope/my-plugin@latest");
  });
});
