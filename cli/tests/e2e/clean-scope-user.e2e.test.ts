import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

// CI runners carry no git identity; a commit made by a test brings its own.
const GIT_TEST_IDENTITY = ["-c", "user.email=t@t.com", "-c", "user.name=t"];

const execFileAsync = promisify(execFile);
const FRAMEWORK_REAL_PATH = resolve(process.cwd(), "tests/fixtures/framework-real");

async function gitStatusPorcelain(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
    cwd,
    env: environmentWithoutGitVariables(process.env),
  });
  return stdout;
}

/** Every file under `dir`, relative to it, recursively — `[]` for a directory that no
 * longer exists, the honest "nothing left" answer rather than a thrown ENOENT. */
async function listFilesUnder(dir: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const nested of await listFilesUnder(full)) results.push(join(entry.name, nested));
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

/** Whether a directory is still there at all — `listFilesUnder` answers `[]` for an
 * empty one and for a removed one alike, so proving a shell was removed needs its own
 * question. */
async function directoryExists(dir: string): Promise<boolean> {
  try {
    await readdir(dir);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

describe("E2E: clean --scope user purges the shared source", () => {
  it("purges its own whitelist only, leaving auth.json, telemetry/ and an unrelated marketplace entry untouched, after setup --scope user", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-scope-user");
    try {
      await gitInit(projectDir);
      await execFileAsync("git", [...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "empty"], {
        cwd: projectDir,
        env: environmentWithoutGitVariables(process.env),
      });

      const setupResult = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "none",
          "--yes",
          "--scope",
          "user",
        ],
        projectDir,
        fakeHome
      );
      expect(setupResult.exitCode).toBe(0);

      const userConfigDir = join(fakeHome, ".config", "aidd");
      const marketplacesPath = join(userConfigDir, "marketplaces.json");
      const beforeMarketplaces = await readJson(marketplacesPath);
      const beforeNames = (beforeMarketplaces.marketplaces as Array<{ name: string }>).map(
        (m) => m.name
      );
      expect(beforeNames).toContain("aidd-framework");

      // A second, unrelated registration, plus the two files this whitelist has no
      // business touching — `clean --scope user` must leave every one of them alone.
      const marketplaces = beforeMarketplaces.marketplaces as Array<Record<string, unknown>>;
      marketplaces.push({
        name: "other-marketplace",
        source: { kind: "local", path: "/src/other" },
        scope: "user",
        addedAt: "2026-01-01T00:00:00.000Z",
      });
      await writeFile(
        marketplacesPath,
        JSON.stringify({ ...beforeMarketplaces, marketplaces }, null, 2),
        "utf-8"
      );
      await writeFile(join(userConfigDir, "auth.json"), '{"version":1}', "utf-8");
      const telemetryFile = join(userConfigDir, "telemetry", "2026-01-01.jsonl");
      await mkdir(join(userConfigDir, "telemetry"), { recursive: true });
      await writeFile(telemetryFile, '{"kind":"session"}\n', "utf-8");

      // This sandbox reaches no real `claude` binary (see
      // sandbox-reaches-no-tool-binary.e2e.test.ts), so `setup --scope user` never
      // builds the shared source's own tree here — that only happens once a host's own
      // CLI actually needs it (`smoke:real` is what proves that against a real
      // binary). A fixture stands in for what such a round-trip would have left
      // behind: this is the load-bearing state `clean --scope user` must purge.
      const builtDir = join(userConfigDir, "cache", "built", "9.9.9", "aidd-framework", "claude");
      await mkdir(builtDir, { recursive: true });
      await writeFile(join(builtDir, "marker.json"), "{}", "utf-8");
      // The self-update check cache, which any online command writes beside `built/`.
      // It is aidd's own file, so the whitelist takes it too — and only then is the
      // `cache/` shell around both actually empty enough to go with them.
      await writeFile(
        join(userConfigDir, "cache", "update-check.json"),
        '{"checkedAt":0,"latest":"9.9.9"}',
        "utf-8"
      );

      const before = (await listFilesUnder(userConfigDir)).sort();
      expect(before).toContain(
        join("cache", "built", "9.9.9", "aidd-framework", "claude", "marker.json")
      );
      expect(before).toContain(join("cache", "update-check.json"));

      const cleanResult = await runCli(
        ["clean", "--scope", "user", "--force"],
        projectDir,
        fakeHome
      );
      expect(cleanResult.exitCode).toBe(0);

      // `setup --scope user` never touches the project, and neither does
      // `clean --scope user` — both are machine-scope operations.
      expect(await gitStatusPorcelain(projectDir)).toBe("");

      const after = (await listFilesUnder(userConfigDir)).sort();
      // The full delta, not a list of paths this test happens to think of: the whole
      // built cache (including the fixture above), the manifest and any references
      // file are gone. `marketplaces.json` survives with its `aidd-framework` entry
      // gone but `other-marketplace` intact, and `auth.json`/`telemetry/` — files this
      // whitelist has no business under — both survive untouched. No binary was ever
      // on PATH here, so there is nothing an absent binary leaves behind to name
      // either.
      expect(before).not.toEqual(after);
      expect(after).toEqual(
        ["auth.json", "marketplaces.json", join("telemetry", "2026-01-01.jsonl")].sort()
      );
      const afterMarketplaces = await readJson(marketplacesPath);
      const afterNames = (afterMarketplaces.marketplaces as Array<{ name: string }>).map(
        (m) => m.name
      );
      expect(afterNames).not.toContain("aidd-framework");
      expect(afterNames).toContain("other-marketplace");
      expect(await readFile(telemetryFile, "utf-8")).toBe('{"kind":"session"}\n');
      // `listFilesUnder` sees files, never an empty directory, so the shell itself has
      // to be asked for by name: nothing of aidd's was left under `cache/`, so `cache/`
      // is gone too rather than surviving as an empty husk.
      expect(await directoryExists(join(userConfigDir, "cache"))).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it("still purges the whitelist when no user manifest exists, the state a plain project-scope setup leaves", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("clean-scope-user-no-manifest");
    try {
      await gitInit(projectDir);
      await execFileAsync("git", [...GIT_TEST_IDENTITY, "commit", "--allow-empty", "-m", "empty"], {
        cwd: projectDir,
        env: environmentWithoutGitVariables(process.env),
      });

      // A plain, project-scope setup — no `--scope user` — never writes a user
      // manifest, yet still registers the shared source machine-wide (architecture.md).
      const setupResult = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          FRAMEWORK_REAL_PATH,
          "--ai",
          "claude",
          "--plugins",
          "none",
          "--yes",
        ],
        projectDir,
        fakeHome
      );
      expect(setupResult.exitCode).toBe(0);

      const userConfigDir = join(fakeHome, ".config", "aidd");
      const before = (await listFilesUnder(userConfigDir)).sort();
      expect(before.some((f) => f.startsWith(join("cache", "built")))).toBe(true);
      expect(before).toContain("references.json");
      expect(await readJson(join(userConfigDir, "manifest.json")).catch(() => null)).toBeNull();

      const statusBeforeClean = await gitStatusPorcelain(projectDir);

      const cleanResult = await runCli(
        ["clean", "--scope", "user", "--force"],
        projectDir,
        fakeHome
      );

      expect(cleanResult.exitCode).toBe(0);
      expect(cleanResult.stdout).toContain("No host registration was undone");
      expect(await gitStatusPorcelain(projectDir)).toBe(statusBeforeClean);

      const after = (await listFilesUnder(userConfigDir)).sort();
      expect(after).not.toContain("references.json");
      expect(after.some((f) => f.startsWith("cache"))).toBe(false);
      expect(await directoryExists(join(userConfigDir, "cache"))).toBe(false);
      const afterMarketplaces = await readJson(join(userConfigDir, "marketplaces.json"));
      const afterNames = (afterMarketplaces.marketplaces as Array<{ name: string }>).map(
        (m) => m.name
      );
      expect(afterNames).not.toContain("aidd-framework");
    } finally {
      await cleanup();
    }
  });
});
