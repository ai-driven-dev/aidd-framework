/**
 * Framework build golden — machine-independent output snapshot for all targets and modes.
 *
 * Captures the file tree hash map from `translate <source> --to <t> [--as flat]`
 * (phase 18's pure rename of `framework build --target <t> [--flat]`) against
 * tests/fixtures/framework-real and compares byte-for-byte against the stored
 * baseline in snapshots/framework-build/golden.json. A pure rename changes no output,
 * which is exactly what this file must keep proving as the invocation moves.
 *
 * The stored JSON maps key → { relative-path → SHA-256 hex }. Key format:
 *   "<target>" for marketplace mode, "<target>:flat" for flat mode.
 * All values are derived from file content only (no absolute paths, no timestamps).
 * This makes the snapshot machine-independent.
 *
 * FROZEN CELLS: all nine. Every cell's fresh build is byte-compared to the stored
 * baseline on every run, so a regression particular to one target fails here.
 *
 * It was one cell — claude — until the day a copilot-only regression shipped and this
 * file could not see it: claude's content rewrite is the identity, so the only guarded
 * cell was structurally incapable of catching a change in any other profile's. Freezing
 * the other eight immediately surfaced a stale one (see below), which is the argument for
 * doing it.
 *
 * RE-BASELINED CELLS, and why:
 *   claude — agents-manifest-fix pass: `agents` became a list of ./agents/*.md paths
 *     instead of the invalid `["./agents"]` dir form.
 *   claude:flat, cursor:flat, copilot:flat, codex:flat, opencode:flat — flat-discovery-fix
 *     pass: bare paths, no plugin segment.
 *   cursor, copilot — same agents-manifest-fix pass as claude.
 *   codex, copilot:flat, codex:flat — 2026-09-03, when the other eight cells were frozen
 *     for the first time. All three were stale, and none of the drift came from that day's
 *     work: each was verified against a binary built at this branch's base, which produces
 *     the same output. The stored file has had one write since the CLI was migrated into
 *     this repository, and the eight unfrozen cells were never compared to it again. (The
 *     re-baselining passes listed above happened before that migration, on branches whose
 *     writes were folded into the migration snapshot.)
 *       codex, 30 SKILL.md files — codex is the only target that re-serialises skill
 *         frontmatter (`stripCodexSkillFrontmatter`), and `serializeFrontmatter` quotes
 *         scalars, so its output stopped matching the source bytes the baseline recorded.
 *       copilot:flat, 2 hook files — the hooks format grew a `version` field and a
 *         flattened shape after the baseline was written.
 *       codex:flat, `.codex/config.toml` — `mergeCodexConfigToml` writes the merged file
 *         and its invariants moved after the baseline was taken. The current content holds
 *         them: `project_doc_max_bytes` 262144, `features.hooks` true, three merged
 *         `mcp_servers`, each pinned by `tests/contexts/tools/domain/profiles/codex.unit.test.ts`.
 *   opencode:flat — opencode-and-scope.md, Lot A: OpenCode's own plugin loader imports
 *     every file under `.opencode/plugin/` in-process, and a plain hook script there
 *     killed the host (uncatchable `process.exit`). `.opencode/plugin/update_memory.js`
 *     is now `.opencode/hooks/aidd-context/update_memory.js` — namespaced per plugin,
 *     the same shape `.claude/hooks/<plugin>/` and `.cursor/hooks/<plugin>/` already use.
 *     Content hash unchanged: only the path moved.
 *
 * USAGE:
 *   Capture all:   UPDATE_FRAMEWORK_GOLDEN=1 pnpm test:e2e tests/golden/framework-build-golden.e2e.test.ts
 *   Verify:        pnpm test:e2e tests/golden/framework-build-golden.e2e.test.ts
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

/** All marketplace targets */
const MARKETPLACE_TARGETS = ["copilot", "codex", "claude", "cursor"] as const;
/** All flat targets (including opencode which is flat-only) */
const FLAT_TARGETS = ["claude", "cursor", "copilot", "codex", "opencode"] as const;

/**
 * Every cell is frozen: each fresh build is byte-compared to its stored hash on every run.
 * Re-baselining one is a deliberate act with a reason recorded in the header above, never
 * a reflex when a run goes red.
 */
const FROZEN_CELLS = new Set<string>([
  ...MARKETPLACE_TARGETS,
  ...FLAT_TARGETS.map((target) => `${target}:flat`),
]);

// This repo carries no .gitattributes, so a Windows checkout's core.autocrlf converts
// every text file's LF to CRLF on write to disk (#707) - hashing those raw bytes would
// diff on line endings alone against the LF-committed stored baseline. Fold CRLF -> LF
// before hashing; skip anything that doesn't round-trip through UTF-8 (this tree's
// outputs are all .md/.json/.yml/.js today) so a future binary asset isn't corrupted.
function normalizeLineEndings(content: Buffer): Buffer {
  const text = content.toString("utf-8");
  if (Buffer.byteLength(text, "utf-8") !== content.length) return content;
  return Buffer.from(text.replace(/\r\n/g, "\n"), "utf-8");
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
  // `translate` is the pure rename of `framework build` (phase 18): same sourceDir,
  // outDir and mode, so the captured file tree — and this golden — must not move.
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

      // Assert all 9 cells exist in stored
      const expectedCells = [...MARKETPLACE_TARGETS, ...FLAT_TARGETS.map((t) => `${t}:flat`)];
      for (const key of expectedCells) {
        expect(stored[key], `stored snapshot missing cell: ${key}`).toBeDefined();
        expect(Object.keys(stored[key]).length, `cell ${key} must have files`).toBeGreaterThan(0);
      }

      // Every mismatching cell at once. Asserting inside the loop stops at the first, so a
      // change landing across several profiles reads as one, and the next is found only
      // after a fix and a re-run.
      const drifted = [...FROZEN_CELLS].filter(
        (key) => JSON.stringify(captured[key]) !== JSON.stringify(stored[key])
      );
      expect(drifted, "cells differing from their stored baseline").toEqual([]);
      for (const key of FROZEN_CELLS) {
        expect(captured[key], `cell ${key}`).toStrictEqual(stored[key]);
      }
    } finally {
      await cleanup();
    }
  }, 120_000);

  it("the matrix covers every tool the CLI builds for, and nothing else", () => {
    // "All nine cells" only means "all of them" while the two hand-written target lists
    // still cover every tool in the registry, and while the stored file holds those cells
    // and no others. A sixth tool absent from the lists, or a cell quietly dropped from
    // one of them, would leave the matrix reading complete and guarding less — the same
    // "nobody compares this" the frozen set exists to close, one level up.
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
