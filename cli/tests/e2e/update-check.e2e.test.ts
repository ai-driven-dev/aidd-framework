import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const CLI_PATH = resolve(process.cwd(), "dist/cli.js");
const FAKE_TAG = "v999.0.0"; // current CLI is 4.6.x → always outdated against this

interface FakeRelease {
  baseUrl: string;
  hits: () => number;
  close: () => Promise<void>;
}

/**
 * Local stand-in for both upstreams the updater queries: the npm registry
 * (source of truth for the version) and GitHub (best-effort changelog).
 * Counts every hit.
 */
function startFakeRelease(tag: string): Promise<FakeRelease> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits += 1;
    res.writeHead(200, { "content-type": "application/json" });
    // npm dist-tags carries the version; GitHub release-by-tag carries the changelog.
    if ((req.url ?? "").includes("/dist-tags")) {
      res.end(JSON.stringify({ latest: tag.replace(/^v/, "") }));
      return;
    }
    res.end(JSON.stringify({ tag_name: tag, body: "" }));
  });
  return new Promise((resolveReady) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolveReady({
        baseUrl: `http://127.0.0.1:${port}`,
        hits: () => hits,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

interface TestEnv {
  projectDir: string;
  cachePath: string;
  /** Where this cache lived before it moved under `cache/` — still read, never written. */
  legacyCachePath: string;
  env: Record<string, string>;
  server: FakeRelease;
  cleanup: () => Promise<void>;
}

async function setupEnv(prefix: string): Promise<TestEnv> {
  const tempDir = await mkdtemp(join(tmpdir(), `aidd-update-check-${prefix}-`));
  const projectDir = join(tempDir, "project");
  const configDir = join(tempDir, "config");
  await mkdir(join(projectDir, ".aidd"), { recursive: true });
  await writeFile(
    join(projectDir, ".aidd", "manifest.json"),
    JSON.stringify({ version: 5, tools: {}, marketplaces: {} }),
    "utf-8"
  );
  const server = await startFakeRelease(FAKE_TAG);
  return {
    projectDir,
    // Under `cache/`, beside the other disposable things, rather than loose among the files
    // a person chose. The path before the move is `legacyCachePath` below, still read.
    cachePath: join(configDir, "cache", "update-check.json"),
    legacyCachePath: join(configDir, "update-check.json"),
    env: {
      HOME: tempDir,
      AIDD_USER_CONFIG_DIR: configDir,
      AIDD_SELF_UPDATE_API_BASE: server.baseUrl,
      AIDD_SELF_UPDATE_NPM_BASE: server.baseUrl,
      AIDD_SKIP_MARKETPLACE_REFRESH: "1",
    },
    server,
    cleanup: async () => {
      await server.close();
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

async function runCli(
  args: string[],
  cwd: string,
  env: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.code ?? 1 };
  }
}

describe("E2E: update-check piggyback", () => {
  it("hot path is read-only and offline: cold offline command makes no request and writes no cache", async () => {
    const t = await setupEnv("cold");
    try {
      await runCli(["status"], t.projectDir, t.env);

      // `status` is not an online command → no piggyback refresh.
      expect(t.server.hits()).toBe(0);
      expect(existsSync(t.cachePath)).toBe(false);
    } finally {
      await t.cleanup();
    }
  });

  it("shows the nag from cache without any network call", async () => {
    const t = await setupEnv("nag");
    try {
      await mkdir(join(t.cachePath, ".."), { recursive: true });
      await writeFile(
        t.cachePath,
        JSON.stringify({ checkedAt: Date.now(), latest: "999.0.0" }),
        "utf-8"
      );

      const { stderr } = await runCli(["status"], t.projectDir, t.env);

      expect(stderr).toContain("CLI update available");
      expect(t.server.hits()).toBe(0); // hot path never touches the network
    } finally {
      await t.cleanup();
    }
  });

  it("online command refreshes the cache via postAction (the regression guard)", async () => {
    const t = await setupEnv("refresh");
    try {
      // Cold cache. `update` IS an online command → postAction must fetch + persist
      // BEFORE the process exits. The old fire-and-forget design left this file absent.
      const { exitCode } = await runCli(["update"], t.projectDir, t.env);

      expect(exitCode).toBe(0);
      expect(existsSync(t.cachePath)).toBe(true);
      expect(t.server.hits()).toBeGreaterThanOrEqual(1);
      const cached = JSON.parse(readFileSync(t.cachePath, "utf-8")) as { latest: string };
      expect(cached.latest).toBe("999.0.0");
    } finally {
      await t.cleanup();
    }
  });

  it("still reads a cache written before it moved, rather than refetching every install at once", async () => {
    // The file moved into `cache/`. Nothing rewrites the old one, but reading it is what
    // keeps the move from costing every existing install a network call the first time it
    // runs an online command.
    const t = await setupEnv("legacy");
    try {
      await mkdir(dirname(t.legacyCachePath), { recursive: true });
      await writeFile(
        t.legacyCachePath,
        JSON.stringify({ checkedAt: Date.now(), latest: "99.0.0" }),
        "utf-8"
      );

      const { stderr } = await runCli(["status"], t.projectDir, t.env);

      // `status` is offline: the notice can only have come from the file on disk.
      expect(t.server.hits()).toBe(0);
      expect(stderr).toContain("99.0.0");
    } finally {
      await t.cleanup();
    }
  });
});
