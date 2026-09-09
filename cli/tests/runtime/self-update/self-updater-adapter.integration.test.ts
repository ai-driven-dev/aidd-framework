import { execSync } from "node:child_process";
import { platform } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrameworkResolutionError, HttpNotFoundError } from "../../../src/kernel/errors.js";
import {
  HttpClient,
  type HttpGet,
  type HttpResponse,
} from "../../../src/runtime/http/http-client.js";
import { SelfUpdaterAdapter } from "../../../src/runtime/self-update/self-updater-adapter.js";

interface GetCall {
  url: string;
  accept?: string;
}

/** Fake HTTP GET routing by URL so fetchLatestRelease can be exercised offline. */
function fakeHttp(
  routes: Record<string, () => HttpResponse | Promise<HttpResponse>>,
  calls: GetCall[] = []
): HttpGet {
  return {
    get: async (url: string, options?: { accept?: string }) => {
      calls.push({ url, accept: options?.accept });
      const route = routes[url];
      if (!route) throw new HttpNotFoundError(url);
      return route();
    },
  };
}

function jsonResponse(body: unknown): HttpResponse {
  return { body, statusCode: 200, contentType: "application/json" };
}

const NPM_DIST_TAGS_URL = "https://registry.npmjs.org/-/package/@ai-driven-dev/cli/dist-tags";
// The repository this package lives in, and the tag release-please gives it:
// `include-component-in-tag` makes it `cli-v<semver>`, never a bare `v<semver>`.
const GH_TAG_URL = "https://api.github.com/repos/ai-driven-dev/framework/releases/tags/cli-v5.1.2";

vi.mock("node:child_process", () => ({ execSync: vi.fn() }));
vi.mock("node:os", () => ({ platform: vi.fn() }));

const mockExecSync = vi.mocked(execSync);
const mockPlatform = vi.mocked(platform);

function makeAdapter(): SelfUpdaterAdapter {
  return new SelfUpdaterAdapter(new HttpClient());
}

function mockInstall(whichOutput: string, os: "win32" | "linux" | "darwin" = "linux"): void {
  mockPlatform.mockReturnValue(os);
  // which/where is read with `encoding: "utf8"` and answers a string; the install call runs
  // piped and answers a Buffer. Both are what execSync really returns.
  mockExecSync.mockReturnValueOnce(whichOutput).mockReturnValue(Buffer.alloc(0));
}

describe("self-updater-adapter — fetchLatestRelease", () => {
  it("resolves the version from the npm registry, not the GitHub repo", async () => {
    const http = fakeHttp({
      [NPM_DIST_TAGS_URL]: () => jsonResponse({ latest: "5.1.2" }),
      [GH_TAG_URL]: () => jsonResponse({ tag_name: "v5.1.2", body: "## changes" }),
    });
    const release = await new SelfUpdaterAdapter(http).fetchLatestRelease();
    expect(release).toEqual({ version: "5.1.2", changelog: "## changes" });
  });

  it("requests plain JSON from npm so the registry does not 406 on the GitHub Accept default", async () => {
    const calls: GetCall[] = [];
    const http = fakeHttp(
      {
        [NPM_DIST_TAGS_URL]: () => jsonResponse({ latest: "5.1.2" }),
        [GH_TAG_URL]: () => jsonResponse({ body: "" }),
      },
      calls
    );
    await new SelfUpdaterAdapter(http).fetchLatestRelease();
    expect(calls.find((c) => c.url === NPM_DIST_TAGS_URL)?.accept).toBe("application/json");
  });

  it("returns the version with a null changelog when the GitHub release 404s (private repo, no token)", async () => {
    const http = fakeHttp({
      [NPM_DIST_TAGS_URL]: () => jsonResponse({ latest: "5.1.2" }),
      // GH_TAG_URL absent => fakeHttp throws HttpNotFoundError, mirroring the private-repo 404
    });
    const release = await new SelfUpdaterAdapter(http).fetchLatestRelease();
    expect(release).toEqual({ version: "5.1.2", changelog: null });
  });

  it("resolves the latest version for an unauthenticated user (token provider yields null)", async () => {
    const calls: GetCall[] = [];
    const http = fakeHttp(
      {
        [NPM_DIST_TAGS_URL]: () => jsonResponse({ latest: "5.1.2" }),
        [GH_TAG_URL]: () => jsonResponse({ body: "Release notes" }),
      },
      calls
    );
    const tokenProvider = { resolve: async () => null };

    const release = await new SelfUpdaterAdapter(http, { tokenProvider }).fetchLatestRelease();

    expect(release.version).toBe("5.1.2");
    expect(calls.some((c) => c.url === NPM_DIST_TAGS_URL)).toBe(true);
  });

  it("traces the reason on the debug channel when the changelog fetch fails", async () => {
    const debug = vi.fn();
    const http = fakeHttp({
      [NPM_DIST_TAGS_URL]: () => jsonResponse({ latest: "5.1.2" }),
      // GH_TAG_URL absent => changelog fetch 404s
    });
    const logger = { debug, info: vi.fn(), warn: vi.fn() };
    await new SelfUpdaterAdapter(http, { logger }).fetchLatestRelease();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining("Changelog unavailable"));
  });

  it("throws a domain error when the npm registry response is unusable", async () => {
    const http = fakeHttp({
      [NPM_DIST_TAGS_URL]: () => jsonResponse({ unexpected: true }),
    });
    await expect(new SelfUpdaterAdapter(http).fetchLatestRelease()).rejects.toBeInstanceOf(
      FrameworkResolutionError
    );
  });
});

describe("self-updater-adapter — package manager detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Unix", () => {
    it("detects pnpm from /pnpm/ path", () => {
      mockInstall("/home/user/.local/share/pnpm/aidd");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "pnpm add -g @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });

    it("detects yarn from /.yarn/ path", () => {
      mockInstall("/home/user/.yarn/bin/aidd");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "yarn global add @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });

    it("detects bun from /bun/ path", () => {
      mockInstall("/home/user/.bun/bin/aidd");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "bun add -g @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });

    it("falls back to npm for system paths", () => {
      mockInstall("/usr/local/bin/aidd");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "npm install -g @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });
  });

  describe("Windows — path separator", () => {
    it("detects pnpm from backslash path", () => {
      mockInstall("C:\\Users\\user\\AppData\\Local\\pnpm\\aidd.cmd\r\n", "win32");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "pnpm add -g @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });

    it("detects yarn from AppData\\Local\\Yarn\\bin path", () => {
      mockInstall("C:\\Users\\user\\AppData\\Local\\Yarn\\bin\\aidd.cmd\r\n", "win32");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "yarn global add @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });

    it("detects bun from .bun backslash path", () => {
      mockInstall("C:\\Users\\user\\.bun\\bin\\aidd.cmd\r\n", "win32");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "bun add -g @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });

    it("falls back to npm for system paths on Windows", () => {
      mockInstall("C:\\Program Files\\nodejs\\aidd.cmd\r\n", "win32");
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "npm install -g @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });
  });

  describe("Windows — multiple results from where", () => {
    it("uses only the first line when where returns multiple matches", () => {
      mockInstall(
        "C:\\Users\\user\\AppData\\Local\\pnpm\\aidd.cmd\r\nC:\\Users\\user\\AppData\\Local\\pnpm\\aidd\r\n",
        "win32"
      );
      makeAdapter().install();
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        "pnpm add -g @ai-driven-dev/cli@latest",
        expect.anything()
      );
    });

    it("throws when where returns no output", () => {
      mockPlatform.mockReturnValue("win32");
      mockExecSync.mockImplementationOnce(() => {
        throw new Error("not found");
      });
      expect(() => makeAdapter().install()).toThrow("Could not detect package manager");
    });
  });
});

describe("self-updater-adapter — install", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces a read:packages hint when the install command fails", () => {
    mockPlatform.mockReturnValue("linux");
    mockExecSync.mockReturnValueOnce("/usr/local/bin/aidd").mockImplementationOnce(() => {
      throw new Error("npm error 403");
    });
    expect(() => makeAdapter().install()).toThrow("read:packages");
  });

  it("surfaces an elevation hint when the install fails with EPERM", () => {
    mockPlatform.mockReturnValue("win32");
    mockExecSync
      .mockReturnValueOnce("C:\\Program Files\\nodejs\\aidd.cmd")
      .mockImplementationOnce(() => {
        const err = new Error("Command failed") as Error & { stderr: Buffer };
        err.stderr = Buffer.from("npm error code EPERM\nnpm error syscall mkdir");
        throw err;
      });
    expect(() => makeAdapter().install()).toThrow(/Administrator|npm config set prefix/);
  });

  it("classifies EACCES failures as elevation errors too", () => {
    mockPlatform.mockReturnValue("linux");
    mockExecSync.mockReturnValueOnce("/usr/local/bin/aidd").mockImplementationOnce(() => {
      const err = new Error("Command failed") as Error & { stderr: string };
      err.stderr = "npm error code EACCES";
      throw err;
    });
    expect(() => makeAdapter().install()).toThrow(/npm config set prefix/);
  });
});
