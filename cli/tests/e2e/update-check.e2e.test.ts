import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CLI_PATH } from "./helpers.js";

const execFileAsync = promisify(execFile);
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
    JSON.stringify({ version: 6, tools: {} }),
    "utf-8"
  );
  const server = await startFakeRelease(FAKE_TAG);
  return {
    projectDir,
    cachePath: join(configDir, "update-check.json"),
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
      await runCli(["doctor"], t.projectDir, t.env);

      // `doctor` is not an online command → no piggyback refresh.
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

      // `update` is excluded from the preAction nag (it resolves the latest version
      // itself), so any other command exercises the generic cache-only path.
      const { stderr } = await runCli(["doctor"], t.projectDir, t.env);

      expect(stderr).toContain("CLI update available");
      expect(t.server.hits()).toBe(0); // hot path never touches the network
    } finally {
      await t.cleanup();
    }
  });

  it("online command refreshes the cache via postAction (the regression guard)", async () => {
    const t = await setupEnv("refresh");
    try {
      // Cold cache. `marketplace list` IS an online command → postAction must fetch +
      // persist BEFORE the process exits. `update` is deliberately NOT one of these
      // (self-update resolves the latest version through its own request, not this
      // piggyback) — the old fire-and-forget design left this file absent.
      const { exitCode } = await runCli(["marketplace", "list"], t.projectDir, t.env);

      expect(exitCode).toBe(0);
      expect(existsSync(t.cachePath)).toBe(true);
      expect(t.server.hits()).toBeGreaterThanOrEqual(1);
      const cached = JSON.parse(readFileSync(t.cachePath, "utf-8")) as { latest: string };
      expect(cached.latest).toBe("999.0.0");
    } finally {
      await t.cleanup();
    }
  });
});
