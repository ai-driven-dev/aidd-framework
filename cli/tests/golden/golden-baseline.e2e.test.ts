/** Nothing here reaches the network or a prompt, so a capture never depends on a remote
 * repository, a rate limit or a TTY. `translate` and `--help` have goldens of their own. */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "../e2e/helpers.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const FRAMEWORK_FIXTURE = join(ROOT, "tests/fixtures/framework");
const SNAPSHOT_FILE = join(ROOT, "tests/golden/snapshots/phase0/snapshot.json");

interface CommandEntry {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  filesWritten: string[];
  manifest: unknown;
  /** The shared machine-scope tree lives under the sandbox's fake $HOME, never under
   * `projectDir`, so `filesWritten` cannot see it at all. */
  userConfigFiles?: string[];
  /** `userConfigFiles` names `manifest.json` by filename alone, never what it holds, so a
   * `--scope user` run registering the wrong tool there would pass this snapshot unnoticed. */
  userManifest?: unknown;
}

/** Two captures of the same run must be byte-identical whatever the machine, home
 * directory, version or timestamp. */
function normalize(text: string): string {
  return (
    text
      // Folds a Windows capture into the drive-less, "/"-only shape a POSIX one already has.
      // The lookbehind spares a URL's scheme colon: only a colon not preceded by a letter is a drive.
      .replace(/(?<![A-Za-z])[A-Za-z]:(?=[/\\])/g, "")
      .replace(/\\/g, "/")
      // Absolute paths → placeholder. The built-cache path is the project temp dir,
      // which varies per run; strip it before the fixture/root rules.
      .replace(/\/[^\s",'\\]+\/\.aidd\/cache\/built/g, "<BUILT_CACHE>")
      .replace(/\/[^\s",'\\]+\/tests\/fixtures\/framework/g, "<FRAMEWORK_FIXTURE>")
      .replace(/\/[^\s",'\\]+\/aidd\/cli/g, "<ROOT>")
      // The sandbox's `$HOME` is a fresh per-run temp directory that an `unanswerable`
      // registration message names, so unnormalized it alone makes two captures differ.
      .replace(/\/[^\s",'\\]+\/aidd-e2e-[^/\s",'\\]+\/home\b/g, "<HOME>")
      // `(?<!\d)` rather than `\b`: "v" is a word character, so `\b\d` never matches the
      // digits of a `v<semver>` cell, while both still refuse to clip "5.2.2" out of "15.2.2".
      .replace(/(?<!\d)\d+\.\d+\.\d+\b/g, "<VERSION>")
      .replace(/\r\n/g, "\n")
  );
}

// Normalizes each parsed string, never the JSON text: a replace wide enough to fold both a
// real "\" and its escaped pair would mangle every other escape (`\"`, `\n`) the same way.
function normalizeManifest(value: unknown): unknown {
  if (typeof value === "string") return normalize(value);
  if (Array.isArray(value)) return value.map(normalizeManifest);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        normalizeManifest(v),
      ])
    );
  }
  return value;
}

function normalizeEntry(entry: CommandEntry): CommandEntry {
  return {
    command: normalize(entry.command),
    exitCode: entry.exitCode,
    stdout: normalize(entry.stdout),
    stderr: normalize(entry.stderr),
    filesWritten: entry.filesWritten.map(normalize).sort(),
    manifest: entry.manifest === null ? null : normalizeManifest(entry.manifest),
    userConfigFiles: entry.userConfigFiles?.map(normalize).sort(),
    userManifest:
      entry.userManifest === null || entry.userManifest === undefined
        ? entry.userManifest
        : normalizeManifest(entry.userManifest),
  };
}

function normalizeSnapshot(entries: CommandEntry[]): CommandEntry[] {
  return entries.map(normalizeEntry);
}

async function readManifest(projectDir: string): Promise<unknown> {
  const manifestPath = join(projectDir, ".aidd", "manifest.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Read directly, unlike the project manifest: a `--scope user` install records an empty
 * file list per tool, so no per-file hash needs recomputing to stay machine-independent. */
async function readUserManifest(fakeHome: string): Promise<unknown> {
  const manifestPath = join(fakeHome, ".config", "aidd", "manifest.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Production hashes raw bytes, which can hold an absolute path; rehashing over normalized
 * content is what makes CI and a local machine produce the same digest. */
async function normalizeManifestHashes(manifest: unknown, projectDir: string): Promise<unknown> {
  if (manifest === null || typeof manifest !== "object") return manifest;

  const tools = (manifest as Record<string, unknown>).tools;
  if (!tools || typeof tools !== "object") return manifest;

  const normalizedTools: Record<string, unknown> = {};
  for (const [toolId, tool] of Object.entries(tools as Record<string, unknown>)) {
    normalizedTools[toolId] = await normalizeToolHashes(tool, projectDir);
  }

  return { ...(manifest as Record<string, unknown>), tools: normalizedTools };
}

async function normalizeToolHashes(tool: unknown, projectDir: string): Promise<unknown> {
  if (!tool || typeof tool !== "object") return tool;
  const t = tool as Record<string, unknown>;
  return {
    ...t,
    files: await recomputeFileHashes(t.files, projectDir),
    mergeFiles: await recomputeFileHashes(t.mergeFiles, projectDir),
  };
}

async function recomputeFileHashes(files: unknown, projectDir: string): Promise<unknown> {
  if (!Array.isArray(files)) return files;
  return Promise.all(
    files.map(async (entry: unknown) => {
      if (!entry || typeof entry !== "object") return entry;
      const e = entry as Record<string, unknown>;
      if (typeof e.relativePath !== "string") return entry;
      const content = await readFile(join(projectDir, e.relativePath), "utf-8").catch(() => "");
      const normalizedContent = normalizeFileContent(content, e.relativePath);
      const hash = createHash("md5").update(normalizedContent, "utf-8").digest("hex");
      return { ...e, hash };
    })
  );
}

// A .json file's bytes escape a path separator as two backslashes, so un-escape before
// normalize(). Correct only while these files carry no other escape (`\"`, `\n`, ...).
function normalizeFileContent(content: string, relativePath: string): string {
  return normalize(relativePath.endsWith(".json") ? content.replace(/\\\\/g, "\\") : content);
}

/** Returns a raw entry, not a normalized one. */
async function captureCommand(
  args: string[],
  projectDir: string,
  fakeHome: string,
  options?: { captureUserConfig?: boolean }
): Promise<CommandEntry> {
  const before = await listFiles(projectDir);
  const { stdout, stderr, exitCode } = await runCli(args, projectDir, fakeHome);
  const after = await listFiles(projectDir);
  const filesWritten = after.filter((f) => !before.includes(f)).sort();
  const rawManifest = await readManifest(projectDir);
  const manifest = await normalizeManifestHashes(rawManifest, projectDir);
  const userConfigFiles = options?.captureUserConfig
    ? await listFiles(join(fakeHome, ".config", "aidd"))
    : undefined;
  const userManifest = options?.captureUserConfig ? await readUserManifest(fakeHome) : undefined;

  return {
    command: args.join(" "),
    exitCode,
    stdout,
    stderr,
    filesWritten,
    manifest,
    userConfigFiles,
    userManifest,
  };
}

async function listFiles(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const entries: string[] = [];
  await collectFiles(dir, dir, entries, readdir);
  return entries.sort();
}

async function collectFiles(
  rootDir: string,
  currentDir: string,
  result: string[],
  readdir: (path: string, opts: { withFileTypes: true }) => Promise<import("node:fs").Dirent[]>
): Promise<void> {
  const items = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
  for (const item of items) {
    const full = join(currentDir, item.name);
    const rel = full.slice(rootDir.length + 1);
    if (item.isDirectory()) {
      await collectFiles(rootDir, full, result, readdir);
    } else {
      result.push(rel);
    }
  }
}

/** Not a command, so it produces no entry: its effect shows in what follows. */
async function drift(projectDir: string, relativePath: string): Promise<void> {
  await writeFile(join(projectDir, relativePath), "{}\n", "utf-8");
}

/** One project, state accumulating in order: `clean --force` is terminal, so nothing may
 * follow it but the post-clean read. */
async function captureMatrix(projectDir: string, fakeHome: string): Promise<CommandEntry[]> {
  const entries: CommandEntry[] = [];
  const capture = async (
    args: string[],
    options?: { captureUserConfig?: boolean }
  ): Promise<void> => {
    entries.push(await captureCommand(args, projectDir, fakeHome, options));
  };

  await capture([
    "setup",
    "--source",
    "local",
    "--path",
    FRAMEWORK_FIXTURE,
    "--ai",
    "claude",
    "--plugins",
    "none",
    "--yes",
  ]);

  // `filesWritten` must read `[]` here: a `--scope user` run registers machine-wide and
  // writes nothing under the project. `captureUserConfig` shows the other half.
  await capture(
    [
      "setup",
      "--source",
      "local",
      "--path",
      FRAMEWORK_FIXTURE,
      "--ai",
      "claude",
      "--plugins",
      "none",
      "--yes",
      "--scope",
      "user",
    ],
    { captureUserConfig: true }
  );
  await capture(["doctor", "--scope", "user"]);

  await capture(["doctor"]);
  await capture(["marketplace", "list"]);
  await capture(["plugin", "list"]);

  // The fixture serves aidd-test from a local path, so this stays offline.
  await capture(["plugin", "install", "aidd-test"]);
  await capture(["plugin", "list"]);

  await capture(["framework", "install", "--tool", "cursor", "--force"]);
  await capture(["doctor"]);

  await drift(projectDir, join(".claude", "settings.json"));
  await capture(["doctor"]);

  await capture(["sync", "--force"]);
  await capture(["doctor"]);

  await capture(["plugin", "remove", "aidd-test"]);

  // Only this step lists userConfigDir(), where what a project-scope `clean` leaves behind
  // survives on record: the built cache, the marketplaces.json entry, the decremented reference.
  await capture(["clean", "--force"], { captureUserConfig: true });
  await capture(["doctor"]);

  return entries;
}

/** A project of its own: a plain `setup` registers `aidd-framework` at user scope too, so
 * purging it inside the main matrix would take the entry every later step depends on. */
async function captureUserScopeClean(
  projectDir: string,
  fakeHome: string
): Promise<CommandEntry[]> {
  const entries: CommandEntry[] = [];
  const capture = async (
    args: string[],
    options?: { captureUserConfig?: boolean }
  ): Promise<void> => {
    const entry = await captureCommand(args, projectDir, fakeHome, options);
    entries.push({ ...entry, command: `[user-scope-clean] ${entry.command}` });
  };

  await capture(
    [
      "setup",
      "--source",
      "local",
      "--path",
      FRAMEWORK_FIXTURE,
      "--ai",
      "claude",
      "--plugins",
      "none",
      "--yes",
      "--scope",
      "user",
    ],
    { captureUserConfig: true }
  );
  await capture(["clean", "--scope", "user", "--force"], { captureUserConfig: true });
  await capture(["doctor", "--scope", "user"]);

  return entries;
}

/** A project of their own because `clean --force` ends the main one. Each entry is prefixed
 * so both scenarios share one snapshot file. */
async function captureErrors(projectDir: string, fakeHome: string): Promise<CommandEntry[]> {
  const entries: CommandEntry[] = [];
  const capture = async (args: string[]): Promise<void> => {
    const entry = await captureCommand(args, projectDir, fakeHome);
    entries.push({ ...entry, command: `[errors] ${entry.command}` });
  };

  // A directory that was never set up.
  await capture(["doctor"]);
  await capture(["plugin", "list"]);

  await capture(["plugin", "install", "does-not-exist"]);
  await capture(["framework", "install", "--tool", "not-a-tool"]);
  await capture(["definitely-not-a-command"]);

  await capture([
    "marketplace",
    "add",
    "malformed",
    join(FRAMEWORK_FIXTURE, "marketplace-malformed"),
  ]);

  return entries;
}

async function captureAll(projectDir: string, fakeHome: string): Promise<CommandEntry[]> {
  const main = await captureMatrix(projectDir, fakeHome);
  const errorEnv = await createTestEnv("golden-errors");
  const userScopeCleanEnv = await createTestEnv("golden-user-scope-clean");
  try {
    const errors = await captureErrors(errorEnv.projectDir, errorEnv.fakeHome);
    const userScopeClean = await captureUserScopeClean(
      userScopeCleanEnv.projectDir,
      userScopeCleanEnv.fakeHome
    );
    return [...main, ...errors, ...userScopeClean];
  } finally {
    await errorEnv.cleanup();
    await userScopeCleanEnv.cleanup();
  }
}

describe.concurrent("Golden baseline — command matrix", () => {
  it("snapshot is deterministic (two captures are byte-identical)", async () => {
    const env1 = await createTestEnv("golden-det-1");
    const env2 = await createTestEnv("golden-det-2");
    try {
      const capture1 = normalizeSnapshot(await captureAll(env1.projectDir, env1.fakeHome));
      const capture2 = normalizeSnapshot(await captureAll(env2.projectDir, env2.fakeHome));
      expect(JSON.stringify(capture1, null, 2)).toStrictEqual(JSON.stringify(capture2, null, 2));
    } finally {
      await env1.cleanup();
      await env2.cleanup();
    }
  });

  it("snapshot matches stored baseline (behavior-preserving gate)", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("golden-baseline");
    try {
      const captured = normalizeSnapshot(await captureAll(projectDir, fakeHome));

      if (process.env.UPDATE_GOLDEN === "1") {
        await mkdir(join(ROOT, "tests/golden/snapshots/phase0"), { recursive: true });
        await writeFile(SNAPSHOT_FILE, `${JSON.stringify(captured, null, 2)}\n`, "utf-8");
        console.log(`Golden snapshot updated: ${SNAPSHOT_FILE}`);
        return;
      }

      const stored = JSON.parse(await readFile(SNAPSHOT_FILE, "utf-8")) as CommandEntry[];
      const storedNormalized = normalizeSnapshot(stored);

      expect(JSON.stringify(captured, null, 2)).toStrictEqual(
        JSON.stringify(storedNormalized, null, 2)
      );
    } finally {
      await cleanup();
    }
  });
});
