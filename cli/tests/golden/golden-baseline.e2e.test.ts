/**
 * P1 Golden Baseline — behavior snapshot for the core command matrix.
 *
 * Each public CLI command is exercised against a hermetic fixture project.
 * The captured snapshot (stdout, stderr, exitCode, filesWritten, manifest)
 * is normalized (abs-paths → <ROOT>, version strings → <VERSION>) then
 * compared byte-for-byte against the stored baseline in snapshots/phase0/.
 *
 * USAGE:
 *   Capture: UPDATE_GOLDEN=1 pnpm test:e2e --reporter=verbose tests/golden/golden-baseline.e2e.test.ts
 *   Verify:  pnpm test:e2e tests/golden/golden-baseline.e2e.test.ts
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "../e2e/helpers.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const FRAMEWORK_FIXTURE = join(ROOT, "tests/fixtures/framework");
const SNAPSHOT_FILE = join(ROOT, "tests/golden/snapshots/phase0/snapshot.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandEntry {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  filesWritten: string[];
  manifest: unknown;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Replace non-deterministic tokens so two captures of the same run are
 * byte-identical regardless of machine, home dir, version, or timestamp.
 */
function normalize(text: string): string {
  return (
    text
      // A Windows capture spells its separator "\" and carries a drive letter neither
      // placeholder rule expects - fold both into the same drive-less, "/"-only shape a
      // POSIX capture already has, so one set of rules covers a run from either platform.
      // The lookbehind keeps a URL's scheme colon ("https:") alone - only a colon not
      // preceded by a letter is a drive. Only ever called on a raw string (see
      // normalizeManifest below for why the manifest is walked before, not after,
      // JSON.stringify) so there is no JSON escaping here to corrupt.
      .replace(/(?<![A-Za-z])[A-Za-z]:(?=[/\\])/g, "")
      .replace(/\\/g, "/")
      // Absolute paths → placeholder. The built-cache path is the project temp dir,
      // which varies per run; strip it before the fixture/root rules.
      .replace(/\/[^\s",'\\]+\/\.aidd\/cache\/built/g, "<BUILT_CACHE>")
      .replace(/\/[^\s",'\\]+\/tests\/fixtures\/framework/g, "<FRAMEWORK_FIXTURE>")
      .replace(/\/[^\s",'\\]+\/aidd\/cli/g, "<ROOT>")
      // Version strings like 4.5.0 or 4.10.2 in manifest / stdout
      .replace(/\b\d+\.\d+\.\d+\b/g, "<VERSION>")
      // Windows line endings
      .replace(/\r\n/g, "\n")
  );
}

// Walks the parsed manifest and normalizes each string value directly, rather than
// normalizing after JSON.stringify - a Windows path's "\" is a single character in a real
// string but two once JSON-escapes it, and a blanket text replace big enough to fold both
// forms would just as readily mangle every other escape (`\"`, `\n`) the same encoding
// produces, corrupting content `JSON.parse` would then fail on rather than merely miscompare.
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
  };
}

function normalizeSnapshot(entries: CommandEntry[]): CommandEntry[] {
  return entries.map(normalizeEntry);
}

// ---------------------------------------------------------------------------
// Capture helpers
// ---------------------------------------------------------------------------

async function readManifest(projectDir: string): Promise<unknown> {
  const manifestPath = join(projectDir, ".aidd", "manifest.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Recompute manifest file hashes over normalized content so the snapshot is
 * machine-independent. The production code hashes raw file bytes (which may
 * contain an absolute path like extraKnownMarketplaces). We replace each hash
 * with MD5(normalize(fileContent)) so CI and local machines produce the same
 * hex digest.
 */
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

// A .json file's raw bytes escape a real path separator as two literal backslash
// characters, never one - un-escape that pairing before the shared normalize() below,
// which expects a genuine single "\" the same way a parsed string (or raw stdout/stderr)
// already has it. Any other file's bytes are not JSON-encoded, so a literal "\" in them
// already is one; normalize() alone is correct as-is. This only ever un-escapes a real
// path separator correctly if the .json file's own string values carry no other escape
// (`\"`, `\n`, ...) - true of every settings.json this matrix writes today (path, repo,
// and plugin-name values only, per marketplace-entry.ts), not a general JSON un-escaper.
function normalizeFileContent(content: string, relativePath: string): string {
  return normalize(relativePath.endsWith(".json") ? content.replace(/\\\\/g, "\\") : content);
}

/** Run a command and return a single CommandEntry (raw, not normalized). */
async function captureCommand(
  args: string[],
  projectDir: string,
  fakeHome: string
): Promise<CommandEntry> {
  const before = await listFiles(projectDir);
  const { stdout, stderr, exitCode } = await runCli(args, projectDir, fakeHome);
  const after = await listFiles(projectDir);
  const filesWritten = after.filter((f) => !before.includes(f)).sort();
  const rawManifest = await readManifest(projectDir);
  const manifest = await normalizeManifestHashes(rawManifest, projectDir);

  return {
    command: args.join(" "),
    exitCode,
    stdout,
    stderr,
    filesWritten,
    manifest,
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

// ---------------------------------------------------------------------------
// Command matrix
// ---------------------------------------------------------------------------

async function captureMatrix(projectDir: string, fakeHome: string): Promise<CommandEntry[]> {
  const entries: CommandEntry[] = [];

  // 1. setup — initialize from local fixture, claude only, no plugins
  entries.push(
    await captureCommand(
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
      ],
      projectDir,
      fakeHome
    )
  );

  // 2. status — after fresh setup, everything should be in sync
  entries.push(await captureCommand(["status"], projectDir, fakeHome));

  // 3. restore --force — no-op since nothing modified
  entries.push(await captureCommand(["restore", "--force"], projectDir, fakeHome));

  // 4. clean --force — removes all AIDD files
  entries.push(await captureCommand(["clean", "--force"], projectDir, fakeHome));

  // 5. status after clean — warns about missing manifest
  entries.push(await captureCommand(["status"], projectDir, fakeHome));

  return entries;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe.concurrent("Golden baseline — command matrix", () => {
  it("snapshot is deterministic (two captures are byte-identical)", async () => {
    const env1 = await createTestEnv("golden-det-1");
    const env2 = await createTestEnv("golden-det-2");
    try {
      const capture1 = normalizeSnapshot(await captureMatrix(env1.projectDir, env1.fakeHome));
      const capture2 = normalizeSnapshot(await captureMatrix(env2.projectDir, env2.fakeHome));
      expect(JSON.stringify(capture1, null, 2)).toStrictEqual(JSON.stringify(capture2, null, 2));
    } finally {
      await env1.cleanup();
      await env2.cleanup();
    }
  });

  it("snapshot matches stored baseline (behavior-preserving gate)", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("golden-baseline");
    try {
      const captured = normalizeSnapshot(await captureMatrix(projectDir, fakeHome));

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
