/**
 * Framework build golden — machine-independent output snapshot for all targets and modes.
 *
 * Captures the file tree hash map from `framework build --target <t> [--flat]` against
 * tests/fixtures/framework-real and compares byte-for-byte against the stored
 * baseline in snapshots/framework-build/golden.json.
 *
 * The stored JSON maps key → { relative-path → SHA-256 hex }. Key format:
 *   "<target>" for marketplace mode, "<target>:flat" for flat mode.
 * All values are derived from file content only (no absolute paths, no timestamps).
 * This makes the snapshot machine-independent.
 *
 * FROZEN CELLS (marketplace baseline, never regenerate casually):
 *   claude — re-baselined once in the agents-manifest-fix pass (see below), still frozen since.
 * RE-BASELINED CELLS (flat-discovery-fix pass: bare paths, no plugin segment):
 *   claude:flat, cursor:flat, copilot:flat, codex:flat, opencode:flat
 * RE-BASELINED CELLS (agents-manifest-fix pass: `agents` is now a list of
 *   ./agents/*.md file paths instead of the invalid `["./agents"]` dir form):
 *   claude, cursor, copilot (marketplace)
 *
 * USAGE:
 *   Capture all:   UPDATE_FRAMEWORK_GOLDEN=1 pnpm test:e2e tests/golden/framework-build-golden.e2e.test.ts
 *   Verify:        pnpm test:e2e tests/golden/framework-build-golden.e2e.test.ts
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "../e2e/helpers.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const FRAMEWORK_FIXTURE = join(ROOT, "tests/fixtures/framework-real");
const SNAPSHOT_FILE = join(ROOT, "tests/golden/snapshots/framework-build/golden.json");

type TargetSnapshot = Record<string, string>; // rel-path → sha256
type GoldenSnapshot = Record<string, TargetSnapshot>; // key → files

/** All marketplace targets */
const MARKETPLACE_TARGETS = ["copilot", "codex", "claude", "cursor"] as const;
/** All flat targets (including opencode which is flat-only) */
const FLAT_TARGETS = ["claude", "cursor", "copilot", "codex", "opencode"] as const;

/**
 * Frozen marketplace cell: its fresh build is byte-compared to the stored hash on
 * every run. Only claude is frozen — cursor/codex/copilot were re-baselined in the
 * plugin-root-token-rewrite pass (${CLAUDE_PLUGIN_ROOT} → tool-native token), and
 * copilot:flat in the flat-discovery-fix pass. claude itself was re-baselined once
 * in the agents-manifest-fix pass (agents → ./agents/*.md file list) and is frozen
 * at that value since.
 */
const FROZEN_CELLS = new Set(["claude"]);

async function hashDirectory(dir: string): Promise<TargetSnapshot> {
  const result: TargetSnapshot = {};
  const entries = await readdir(dir, { recursive: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const content = await readFile(fullPath);
      result[entry.replace(/\\/g, "/")] = createHash("sha256").update(content).digest("hex");
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
  const args = [
    "framework",
    "build",
    "--source",
    FRAMEWORK_FIXTURE,
    "--target",
    target,
    "--out",
    outDir,
  ];
  if (flat) args.push("--flat");
  const result = await runCli(args, projectDir, fakeHome);
  if (result.exitCode !== 0) {
    throw new Error(
      `framework build --target ${target}${flat ? " --flat" : ""} failed: ${result.stderr}`
    );
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
  // Two full 9-cell builds, concurrently with the other tests in this file - on a real
  // windows-latest runner this measured at 60039ms and 60096ms, just over the 60s default,
  // not a hang (#707 windows-probe, attempt 3, run 32596840364). Raised per-test rather
  // than the e2e project's global testTimeout so every other e2e file's budget is unchanged.
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

  // Same reason as above: a full 9-cell build, concurrently with the other tests in this
  // file, measured at 60096ms on a real windows-latest runner - just over the 60s default.
  it("stored golden baseline covers all 9 cells and the frozen claude cell is byte-identical (AC #1)", async () => {
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

      // Assert all 9 cells exist in stored
      const expectedCells = [...MARKETPLACE_TARGETS, ...FLAT_TARGETS.map((t) => `${t}:flat`)];
      for (const key of expectedCells) {
        expect(stored[key], `stored snapshot missing cell: ${key}`).toBeDefined();
        expect(Object.keys(stored[key]).length, `cell ${key} must have files`).toBeGreaterThan(0);
      }

      // Assert the frozen cell(s) are byte-identical to the stored baseline
      for (const key of FROZEN_CELLS) {
        const capturedCell = captured[key];
        const storedCell = stored[key];
        expect(
          capturedCell,
          `cell ${key}: output differs from stored pre-change baseline`
        ).toStrictEqual(storedCell);
      }
    } finally {
      await cleanup();
    }
  }, 120_000);

  it("all 9 cells are non-empty", async () => {
    const stored = JSON.parse(await readFile(SNAPSHOT_FILE, "utf-8")) as GoldenSnapshot;
    const expectedCells = [...MARKETPLACE_TARGETS, ...FLAT_TARGETS.map((t) => `${t}:flat`)];
    for (const key of expectedCells) {
      expect(stored[key], `missing cell: ${key}`).toBeDefined();
      expect(Object.keys(stored[key]).length, `cell ${key} must have files`).toBeGreaterThan(0);
    }
  });
});
