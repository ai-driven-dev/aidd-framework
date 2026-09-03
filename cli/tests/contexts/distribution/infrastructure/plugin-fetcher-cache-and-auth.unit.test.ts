/**
 * Where a fetched plugin lands, and what the CLI says when the fetch fails.
 *
 * The cache key is invisible until it is wrong: a key that changes between two runs
 * re-clones every time, and a key two sources share hands one plugin's tree to the other.
 * The failure messages are the only thing a user sees when a private source will not clone
 * — and they must not contain the credential the user typed into the URL.
 *
 * `simple-git` and `execFile` are stubbed so every clone is observed, never run.
 */
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

const mockSimpleGit = vi.fn(() => mockGitInstance);

vi.mock("simple-git", () => ({
  simpleGit: (...args: unknown[]) => mockSimpleGit(...(args as [])),
}));

const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

vi.mock("node:child_process", () => ({
  execFile: (
    cmd: string,
    args: string[],
    cb: (err: unknown, result?: { stdout: string; stderr: string }) => void
  ) => {
    try {
      mockExecFile(cmd, args);
      cb(null, { stdout: "", stderr: "" });
    } catch (err) {
      cb(err);
    }
  },
}));

import { PluginFetcherAdapter } from "../../../../src/contexts/distribution/infrastructure/plugin-fetcher-adapter.js";
import { PluginFetchError } from "../../../../src/kernel/errors.js";
import type { PluginSource } from "../../../../src/kernel/source.js";
import type { TokenProvider } from "../../../../src/runtime/auth/ports/token-provider.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

const CACHE = "/tmp/cache";

function reset(): void {
  mockCloneFn.mockClear().mockResolvedValue(undefined);
  mockRawFn.mockClear().mockResolvedValue(undefined);
  mockCheckoutFn.mockClear().mockResolvedValue(undefined);
  mockSimpleGit.mockClear();
  mockExecFile.mockClear().mockReturnValue(undefined);
}

let lastFs: InMemoryFileAdapter;

function adapter(token?: string, files: Record<string, string> = {}): PluginFetcherAdapter {
  reset();
  lastFs = new InMemoryFileAdapter(files, new DeterministicHasher());
  const provider: TokenProvider | undefined =
    token === undefined ? undefined : { resolve: async () => token };
  return new PluginFetcherAdapter(lastFs, provider);
}

/** The directory the clone was told to write into. */
function clonedInto(): string {
  return mockCloneFn.mock.calls[0]?.[1] as string;
}

/** The URL the clone was given — the one that may legitimately carry a token. */
function clonedFrom(): string {
  return mockCloneFn.mock.calls[0]?.[0] as string;
}

describe("where a fetched source lands in the cache", () => {
  describe("a github repo", () => {
    it("keys on owner, repo and ref, so two refs of one repo do not share a tree", async () => {
      const source: PluginSource = { kind: "github", repo: "acme/widgets", ref: "v2" };

      await adapter().fetch(source, CACHE);

      expect(clonedInto()).toBe(`${CACHE}/github-acme-widgets-v2`);
    });

    it("keys an unpinned repo on HEAD, not on an empty ref", async () => {
      await adapter().fetch({ kind: "github", repo: "acme/widgets" }, CACHE);

      expect(clonedInto()).toBe(`${CACHE}/github-acme-widgets-HEAD`);
    });

    it("is handed back from the cache instead of cloned a second time", async () => {
      const fetcher = adapter(undefined, {
        [`${CACHE}/github-acme-widgets-HEAD/plugin.json`]: "{}",
      });

      const result = await fetcher.fetch({ kind: "github", repo: "acme/widgets" }, CACHE);

      expect(mockCloneFn).not.toHaveBeenCalled();
      expect(result).toBe(`${CACHE}/github-acme-widgets-HEAD`);
    });
  });

  describe("a bare git url", () => {
    it("encodes the url and marks it HEAD when no ref is pinned", async () => {
      await adapter().fetch({ kind: "url", url: "https://example.com/repo.git" }, CACHE);

      expect(clonedInto()).toBe(`${CACHE}/https___example_com_repo_git-HEAD`);
    });

    it("appends the pinned ref, so a pin does not reuse the unpinned tree", async () => {
      await adapter().fetch({ kind: "url", url: "https://example.com/repo.git", ref: "v1" }, CACHE);

      expect(clonedInto()).toBe(`${CACHE}/https___example_com_repo_git-v1`);
    });

    it("truncates the key at 64 characters, the documented path-length guard", async () => {
      const long = `https://example.com/${"a".repeat(200)}.git`;

      await adapter().fetch({ kind: "url", url: long }, CACHE);

      const key = clonedInto().slice(CACHE.length + 1);
      expect(key, "64 encoded characters plus the -HEAD suffix").toBe(
        `${"https___example_com_".concat("a".repeat(44))}-HEAD`
      );
    });
  });

  describe("a subdirectory of a git repo", () => {
    it("keys on url, subpath and ref, and returns the subdirectory itself", async () => {
      const result = await adapter().fetch(
        {
          kind: "git-subdir",
          url: "https://example.com/mono.git",
          path: "packages/one",
          ref: "main",
        },
        CACHE
      );

      const dir = `${CACHE}/https___example_com_mono_git-subdir-packages_one-main`;
      expect(clonedInto()).toBe(dir);
      expect(result, "the caller wants the subdirectory, not the clone root").toBe(
        `${dir}/packages/one`
      );
    });
  });

  describe("a url the user typed their own credential into", () => {
    const url = "https://user:ghp_SECRET@example.com/private.git";

    it("keeps the credential out of the directory name written to disk", async () => {
      await adapter().fetch({ kind: "url", url }, CACHE);

      expect(clonedInto(), "a secret must not become a filename").not.toContain("ghp_SECRET");
      expect(clonedInto()).toBe(`${CACHE}/https___example_com_private_git-HEAD`);
    });

    it("still hands the credential to git, which is what it is for", async () => {
      await adapter().fetch({ kind: "url", url }, CACHE);

      expect(clonedFrom()).toBe(url);
    });
  });
});

describe("the token the CLI adds for the user", () => {
  it("injects a resolved token into an https url", async () => {
    await adapter("tok").fetch({ kind: "github", repo: "acme/widgets" }, CACHE);

    expect(clonedFrom()).toBe("https://x-access-token:tok@github.com/acme/widgets.git");
  });

  it("leaves an ssh url alone, where a token means nothing", async () => {
    await adapter("tok").fetch({ kind: "url", url: "git@example.com:acme/repo.git" }, CACHE);

    expect(clonedFrom()).toBe("git@example.com:acme/repo.git");
  });

  it("injects it into a bare https url too, not only a github shorthand", async () => {
    await adapter("tok").fetch({ kind: "url", url: "https://example.com/private.git" }, CACHE);

    expect(clonedFrom()).toBe("https://tok@example.com/private.git");
  });

  it("injects it when only a subdirectory of a private repo is wanted", async () => {
    await adapter("tok").fetch(
      { kind: "git-subdir", url: "https://example.com/mono.git", path: "packages/one" },
      CACHE
    );

    expect(clonedFrom()).toBe("https://tok@example.com/mono.git");
  });

  it("clones unauthenticated when no provider is wired", async () => {
    await adapter().fetch({ kind: "url", url: "https://example.com/repo.git" }, CACHE);

    expect(clonedFrom()).toBe("https://example.com/repo.git");
  });
});

describe("how each kind of clone is asked for", () => {
  it("clones shallow, and asks for the branch only when one is pinned", async () => {
    await adapter().fetch({ kind: "github", repo: "acme/widgets", ref: "v2" }, CACHE);
    expect(mockCloneFn.mock.calls[0]?.[2]).toEqual(["--depth", "1", "--branch", "v2"]);

    await adapter().fetch({ kind: "github", repo: "acme/widgets" }, CACHE);
    expect(mockCloneFn.mock.calls[0]?.[2]).toEqual(["--depth", "1"]);
  });

  it("fetches a subdirectory without blobs, then narrows, then checks out", async () => {
    const fetcher = adapter();

    await fetcher.fetch(
      { kind: "git-subdir", url: "https://example.com/mono.git", path: "packages/one" },
      CACHE
    );

    expect(mockCloneFn.mock.calls[0]?.[2]).toEqual(["--filter=blob:none", "--no-checkout"]);
    expect(mockRawFn).toHaveBeenCalledWith(["sparse-checkout", "set", "packages/one"]);
    expect(mockCheckoutFn, "no ref pinned means HEAD").toHaveBeenCalledWith("HEAD");
  });

  it("checks out the pinned ref of a subdirectory source", async () => {
    await adapter().fetch(
      {
        kind: "git-subdir",
        url: "https://example.com/mono.git",
        path: "packages/one",
        ref: "release",
      },
      CACHE
    );

    expect(mockCheckoutFn).toHaveBeenCalledWith("release");
  });
});

describe("an npm package as a source", () => {
  it("asks for the pinned version", async () => {
    await adapter().fetch({ kind: "npm", package: "@acme/plugin", version: "1.2.3" }, CACHE);

    expect(mockExecFile).toHaveBeenCalledWith("pnpm", [
      "add",
      "--prefix",
      CACHE,
      "--",
      "@acme/plugin@1.2.3",
    ]);
  });

  it("falls back to latest when no version is pinned", async () => {
    await adapter().fetch({ kind: "npm", package: "@acme/plugin" }, CACHE);

    expect(mockExecFile.mock.calls[0]?.[1]?.at(-1)).toBe("@acme/plugin@latest");
  });

  it("names the spec it could not install", async () => {
    const fetcher = adapter();
    mockExecFile.mockImplementation(() => {
      throw new Error("ERR_PNPM_FETCH_404");
    });

    await expect(
      fetcher.fetch({ kind: "npm", package: "@acme/plugin", version: "9.9.9" }, CACHE)
    ).rejects.toThrow(/@acme\/plugin@9\.9\.9/);
  });
});

describe("what the user is told when a clone fails", () => {
  const url = "https://user:ghp_SECRET@example.com/private.git";

  it("does not print the credential the user typed", async () => {
    const fetcher = adapter();
    mockCloneFn.mockRejectedValue(new Error("fatal: repository not reachable"));

    await expect(fetcher.fetch({ kind: "url", url }, CACHE)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("ghp_SECRET"),
      })
    );
  });

  it("does not print the token the CLI itself injected", async () => {
    const fetcher = adapter("injected-token");
    mockCloneFn.mockRejectedValue(
      new Error("fatal: could not clone https://x-access-token:injected-token@github.com/a/b.git")
    );

    await expect(fetcher.fetch({ kind: "github", repo: "acme/widgets" }, CACHE)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("injected-token") })
    );
  });

  it("keeps the rest of git's message, so the failure is still diagnosable", async () => {
    const fetcher = adapter("injected-token");
    mockCloneFn.mockRejectedValue(
      new Error("fatal: could not clone https://x-access-token:injected-token@github.com/a/b.git")
    );

    await expect(fetcher.fetch({ kind: "github", repo: "acme/widgets" }, CACHE)).rejects.toThrow(
      "fatal: could not clone https://github.com/a/b.git"
    );
  });

  describe("when the remote refused the credentials", () => {
    it("tells an https user how to supply a token", async () => {
      const fetcher = adapter();
      mockCloneFn.mockRejectedValue(new Error("remote: Repository not found"));

      await expect(
        fetcher.fetch({ kind: "url", url: "https://example.com/private.git" }, CACHE)
      ).rejects.toThrow(/aidd auth login/);
    });

    it("tells an ssh user to check their key instead", async () => {
      const fetcher = adapter();
      mockCloneFn.mockRejectedValue(new Error("Permission denied (publickey)"));

      await expect(
        fetcher.fetch({ kind: "url", url: "git@example.com:acme/private.git" }, CACHE)
      ).rejects.toThrow(/SSH key/);
    });
  });

  it("reports an unrecognised failure as a clone failure, not an auth one", async () => {
    const fetcher = adapter();
    mockCloneFn.mockRejectedValue(new Error("fatal: unable to access: server hung up"));

    await expect(
      fetcher.fetch({ kind: "url", url: "https://example.com/repo.git" }, CACHE)
    ).rejects.toThrow(/git clone failed/);
  });
});

describe("a tree already in the cache", () => {
  const dir = `${CACHE}/https___example_com_mono_git-subdir-packages_one-HEAD`;
  const source: PluginSource = {
    kind: "git-subdir",
    url: "https://example.com/mono.git",
    path: "packages/one",
  };

  it("surfaces a failure of the narrowing clone rather than swallowing it", async () => {
    const fetcher = adapter();
    mockCloneFn.mockRejectedValue(new Error("fatal: filter not supported"));

    await expect(fetcher.fetch(source, CACHE)).rejects.toThrow(PluginFetchError);
  });

  it("is handed back without cloning again", async () => {
    const fetcher = adapter(undefined, { [`${dir}/packages/one/plugin.json`]: "{}" });

    const result = await fetcher.fetch(source, CACHE);

    expect(mockCloneFn, "a cached tree is the whole point of the cache").not.toHaveBeenCalled();
    expect(result).toBe(`${dir}/packages/one`);
  });

  it("is kept when the caller passes no options at all", async () => {
    const fetcher = adapter(undefined, { [`${dir}/packages/one/plugin.json`]: "{}" });

    await fetcher.fetch(source, CACHE);

    expect(mockCloneFn, "no options must not mean force-refresh").not.toHaveBeenCalled();
  });

  it("is thrown away and re-cloned when the caller forces a refresh", async () => {
    const fetcher = adapter(undefined, { [`${dir}/packages/one/plugin.json`]: "{}" });

    await fetcher.fetch(source, CACHE, { forceRefresh: true });

    expect(mockCloneFn).toHaveBeenCalledTimes(1);
  });
});

describe("an npm package already installed in the cache", () => {
  const source: PluginSource = { kind: "npm", package: "@acme/plugin" };
  const installed = { [`${CACHE}/node_modules/@acme/plugin/package.json`]: "{}" };

  it("is reinstalled from scratch when the caller forces a refresh", async () => {
    const fetcher = adapter(undefined, installed);

    const result = await fetcher.fetch(source, CACHE, { forceRefresh: true });

    expect(
      await lastFs.fileExists(`${CACHE}/node_modules/@acme/plugin/package.json`),
      "the stale install is wiped, not installed over"
    ).toBe(false);
    expect(result).toBe(`${CACHE}/node_modules/@acme/plugin`);
    expect(mockExecFile, "the reinstall still happens after the wipe").toHaveBeenCalledTimes(1);
  });

  it("is left in place when no refresh is asked for", async () => {
    const fetcher = adapter(undefined, installed);

    await fetcher.fetch(source, CACHE);

    expect(await lastFs.fileExists(`${CACHE}/node_modules/@acme/plugin/package.json`)).toBe(true);
  });
});

describe("a local path as a source", () => {
  it("names the path it resolved, not the one that was typed", async () => {
    const fetcher = adapter();

    await expect(fetcher.fetch({ kind: "local", path: "./missing" }, CACHE)).rejects.toThrow(
      PluginFetchError
    );
    await expect(fetcher.fetch({ kind: "local", path: "./missing" }, CACHE)).rejects.toThrow(
      new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
  });
});
