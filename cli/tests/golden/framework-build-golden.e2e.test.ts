/**
 * Keyed `<target>` or `<target>:flat` → { relative-path → SHA-256 }, so it holds on any
 * machine. Recapture with UPDATE_FRAMEWORK_GOLDEN=1; re-baselining a cell is deliberate.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AI_TOOL_IDS } from "../../src/kernel/tool.js";
import { createTestEnv, runCli } from "../e2e/helpers.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const FRAMEWORK_FIXTURE = join(ROOT, "tests/fixtures/framework-real");
const SNAPSHOT_FILE = join(ROOT, "tests/golden/snapshots/framework-build/golden.json");

type TargetSnapshot = Record<string, string>; // rel-path → sha256
type GoldenSnapshot = Record<string, TargetSnapshot>; // key → files

const MARKETPLACE_TARGETS = ["copilot", "codex", "claude", "cursor"] as const;
const FLAT_TARGETS = ["claude", "cursor", "copilot", "codex", "opencode"] as const;

const FROZEN_CELLS = new Set<string>([
  ...MARKETPLACE_TARGETS,
  ...FLAT_TARGETS.map((target) => `${target}:flat`),
]);

// A Windows checkout's core.autocrlf writes CRLF, which would diff against the LF-committed
// baseline on line endings alone; content that is not UTF-8 is hashed raw instead.
function normalizeLineEndings(content: Buffer): Buffer {
  const text = content.toString("utf-8");
  if (Buffer.byteLength(text, "utf-8") !== content.length) return content;
  return Buffer.from(text.replace(/\r\n/g, "\n"), "utf-8");
}

function canonical(snapshot: TargetSnapshot): string {
  return JSON.stringify(
    Object.keys(snapshot)
      .sort()
      .map((key) => [key, snapshot[key]])
  );
}

function describeDrift(stored: TargetSnapshot, captured: TargetSnapshot): string {
  const keys = new Set([...Object.keys(stored), ...Object.keys(captured)]);
  const moved = [...keys]
    .filter((k) => stored[k] !== captured[k])
    .sort()
    .slice(0, 6)
    .map((k) => {
      if (stored[k] === undefined) return `+${k}`;
      if (captured[k] === undefined) return `-${k}`;
      return `~${k}`;
    });
  return moved.join(", ");
}

async function hashDirectory(dir: string): Promise<TargetSnapshot> {
  const result: TargetSnapshot = {};
  const entries = await readdir(dir, { recursive: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const content = await readFile(fullPath);
      const normalized = normalizeLineEndings(content);
      result[entry.replace(/\\/g, "/")] = createHash("sha256").update(normalized).digest("hex");
    } catch {
      // skip directories
    }
  }
  return result;
}

async function captureTarget(
  target: string,
  flat: boolean,
  projectDir: string,
  fakeHome: string,
  tempDir: string
): Promise<TargetSnapshot> {
  const key = flat ? `${target}:flat` : target;
  const outDir = join(tempDir, `dist-${key.replace(":", "-")}`);
  await mkdir(outDir, { recursive: true });
  const args = ["translate", FRAMEWORK_FIXTURE, "--to", target, "--out", outDir];
  if (flat) args.push("--as", "flat");
  const result = await runCli(args, projectDir, fakeHome);
  if (result.exitCode !== 0) {
    throw new Error(`translate --to ${target}${flat ? " --as flat" : ""} failed: ${result.stderr}`);
  }
  return hashDirectory(outDir);
}

async function captureAllCells(
  projectDir: string,
  fakeHome: string,
  tempDir: string
): Promise<GoldenSnapshot> {
  const captured: GoldenSnapshot = {};
  for (const target of MARKETPLACE_TARGETS) {
    captured[target] = await captureTarget(target, false, projectDir, fakeHome, tempDir);
  }
  for (const target of FLAT_TARGETS) {
    captured[`${target}:flat`] = await captureTarget(target, true, projectDir, fakeHome, tempDir);
  }
  return captured;
}

describe.concurrent("Framework build golden — 9-cell matrix", () => {
  // Two full 9-cell builds measured just past the 60s default on a Windows runner, not a
  // hang. Raised per test so no other e2e file's budget moves.
  it("snapshot is deterministic (two captures of each target are byte-identical)", async () => {
    const env1 = await createTestEnv("fb-golden-det-1");
    const env2 = await createTestEnv("fb-golden-det-2");
    try {
      for (const target of MARKETPLACE_TARGETS) {
        const snap1 = await captureTarget(
          target,
          false,
          env1.projectDir,
          env1.fakeHome,
          env1.tempDir
        );
        const snap2 = await captureTarget(
          target,
          false,
          env2.projectDir,
          env2.fakeHome,
          env2.tempDir
        );
        expect(snap1, `target ${target}: capture 1 vs 2 differ`).toStrictEqual(snap2);
      }
      for (const target of FLAT_TARGETS) {
        const snap1 = await captureTarget(
          target,
          true,
          env1.projectDir,
          env1.fakeHome,
          env1.tempDir
        );
        const snap2 = await captureTarget(
          target,
          true,
          env2.projectDir,
          env2.fakeHome,
          env2.tempDir
        );
        expect(snap1, `${target}:flat capture 1 vs 2 differ`).toStrictEqual(snap2);
      }
    } finally {
      await env1.cleanup();
      await env2.cleanup();
    }
  }, 120_000);

  it("every one of the 9 cells is byte-identical to its stored baseline", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fb-golden-baseline");
    try {
      const captured = await captureAllCells(projectDir, fakeHome, tempDir);

      if (process.env.UPDATE_FRAMEWORK_GOLDEN === "1") {
        await mkdir(join(ROOT, "tests/golden/snapshots/framework-build"), { recursive: true });
        await writeFile(SNAPSHOT_FILE, `${JSON.stringify(captured, null, 2)}\n`, "utf-8");
        console.log(`Framework build golden snapshot updated: ${SNAPSHOT_FILE}`);
        return;
      }

      const stored = JSON.parse(await readFile(SNAPSHOT_FILE, "utf-8")) as GoldenSnapshot;

      const expectedCells = [...MARKETPLACE_TARGETS, ...FLAT_TARGETS.map((t) => `${t}:flat`)];
      for (const key of expectedCells) {
        expect(stored[key], `stored snapshot missing cell: ${key}`).toBeDefined();
        expect(Object.keys(stored[key]).length, `cell ${key} must have files`).toBeGreaterThan(0);
      }

      // Every mismatching cell at once, compared as sorted entries: key order follows the
      // platform's directory listing, the fact under test is which files exist and hash to what.
      const drifted = [...FROZEN_CELLS].filter(
        (key) => canonical(captured[key] ?? {}) !== canonical(stored[key] ?? {})
      );
      const detail = drifted
        .map((key) => `${key}: ${describeDrift(stored[key] ?? {}, captured[key] ?? {})}`)
        .join("\n");
      expect(drifted, `cells differing from their stored baseline\n${detail}`).toEqual([]);
      for (const key of FROZEN_CELLS) {
        expect(captured[key], `cell ${key}`).toStrictEqual(stored[key]);
      }
    } finally {
      await cleanup();
    }
  }, 120_000);

  it("the matrix covers every tool the CLI builds for, and nothing else", () => {
    const matrixTools = new Set<string>([...MARKETPLACE_TARGETS, ...FLAT_TARGETS]);
    for (const id of AI_TOOL_IDS) {
      expect(matrixTools.has(id), `${id} is a registered AI tool with no golden cell`).toBe(true);
    }

    const stored = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8")) as GoldenSnapshot;
    const expectedCells = [...MARKETPLACE_TARGETS, ...FLAT_TARGETS.map((t) => `${t}:flat`)];
    expect(Object.keys(stored).sort()).toEqual([...expectedCells].sort());
    for (const key of expectedCells) {
      expect(Object.keys(stored[key]).length, `cell ${key} must have files`).toBeGreaterThan(0);
    }
  });
});
