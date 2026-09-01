import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Manifest } from "../../../src/domain/models/manifest.js";
import { FileHash, InstallationFile } from "../../../src/kernel/file.js";
import type { ToolId } from "../../../src/kernel/tool.js";
import { VALID_TOOL_IDS } from "../../../src/kernel/tool.js";

// ── Arbitraries ──────────────────────────────────────────────────────────────

/** 32-char lowercase hex → valid MD5. fast-check v4 removed hexaString; use stringMatching. */
const md5Arb = fc.stringMatching(/^[0-9a-f]{32}$/);

/** File path: no null bytes, no leading slash, non-empty. */
const relativePathArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => !s.includes("\0") && !s.startsWith("/") && s.trim().length > 0);

const installationFileArb = fc
  .record({ relativePath: relativePathArb, hash: md5Arb })
  .map(
    ({ relativePath, hash }) =>
      new InstallationFile({ relativePath, content: "x", hash: new FileHash(hash) })
  );

/** Valid tool id drawn from the real constant list. */
const toolIdArb = fc.constantFrom(...(VALID_TOOL_IDS as ToolId[]));

const toolEntryArb = fc.record({
  toolId: toolIdArb,
  version: fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => !s.includes("\n") && s.trim().length > 0),
  files: fc.array(installationFileArb, { maxLength: 6 }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a v6 Manifest from tool entries. Dedup by toolId (last-wins via addTool). */
function buildManifest(
  tools: Array<{ toolId: ToolId; version: string; files: InstallationFile[] }>
): Manifest {
  const m = Manifest.create();
  for (const t of tools) {
    m.addTool(t.toolId, t.version, t.files);
  }
  return m;
}

// ── Property 1: round-trip identity ──────────────────────────────────────────

describe("Manifest property tests", () => {
  it("toJSON → fromJSON → toJSON is identity", () => {
    fc.assert(
      fc.property(fc.array(toolEntryArb, { maxLength: 4 }), (tools) => {
        const m = buildManifest(tools);
        const firstSerialized = m.toJSON();
        const reparsed = Manifest.fromJSON(firstSerialized);
        const secondSerialized = reparsed.toJSON();
        expect(secondSerialized).toEqual(firstSerialized);
      }),
      { numRuns: 100 }
    );
  });

  // ── Property 2: migration chain idempotent on v6 input ──────────────────────

  it("migration chain on v6 input is idempotent (fromJSON round-trips cleanly)", () => {
    fc.assert(
      fc.property(fc.array(toolEntryArb, { maxLength: 4 }), (tools) => {
        const m = buildManifest(tools);
        const v6 = m.toJSON();
        // Apply fromJSON twice — the migration branch must be a no-op on version 6.
        const once = Manifest.fromJSON(v6).toJSON();
        const twice = Manifest.fromJSON(once).toJSON();
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 }
    );
  });

  // ── Property 3: v3/v4 raw shapes deserialize to v5 ──────────────────────────

  it("v3 raw shapes migrate to version 6 without throwing", () => {
    const v3ToolEntryArb = fc.record({
      toolId: toolIdArb,
      version: fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !s.includes("\n") && s.trim().length > 0),
      files: fc.array(fc.record({ relativePath: relativePathArb, hash: md5Arb }), { maxLength: 4 }),
      mergeFiles: fc.constant([]),
    });

    fc.assert(
      fc.property(fc.array(v3ToolEntryArb, { maxLength: 4 }), (rawTools) => {
        const toolsRecord: Record<string, unknown> = {};
        const seenIds = new Set<string>();
        for (const t of rawTools) {
          if (!seenIds.has(t.toolId)) {
            seenIds.add(t.toolId);
            toolsRecord[t.toolId] = { ...t, plugins: [] };
          }
        }
        const rawV3 = {
          version: 3,
          mode: "local",
          docsDir: "aidd_docs",
          tools: toolsRecord,
        };
        const migrated = Manifest.fromJSON(rawV3);
        expect(migrated.toJSON().version).toBe(6);
      }),
      { numRuns: 100 }
    );
  });

  it("v4 raw shapes migrate to version 6 without throwing", () => {
    const v4ToolEntryArb = fc.record({
      toolId: toolIdArb,
      version: fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !s.includes("\n") && s.trim().length > 0),
      files: fc.array(fc.record({ relativePath: relativePathArb, hash: md5Arb }), { maxLength: 4 }),
      mergeFiles: fc.constant([]),
    });

    fc.assert(
      fc.property(fc.array(v4ToolEntryArb, { maxLength: 4 }), (rawTools) => {
        const toolsRecord: Record<string, unknown> = {};
        const seenIds = new Set<string>();
        for (const t of rawTools) {
          if (!seenIds.has(t.toolId)) {
            seenIds.add(t.toolId);
            toolsRecord[t.toolId] = { ...t, plugins: [] };
          }
        }
        const rawV4 = {
          version: 4,
          mode: "local",
          docsDir: "aidd_docs",
          tools: toolsRecord,
        };
        const migrated = Manifest.fromJSON(rawV4);
        expect(migrated.toJSON().version).toBe(6);
      }),
      { numRuns: 100 }
    );
  });
});
