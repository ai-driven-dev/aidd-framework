import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { FileHash, InstallationFile } from "../../../../src/kernel/file.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { VALID_TOOL_IDS } from "../../../../src/kernel/tool.js";

/** 32-char lowercase hex → valid MD5. fast-check v4 removed hexaString; use stringMatching. */
const md5Arb = fc.stringMatching(/^[0-9a-f]{32}$/);

const relativePathArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => !s.includes("\0") && !s.startsWith("/") && s.trim().length > 0);

const installationFileArb = fc
  .record({ relativePath: relativePathArb, hash: md5Arb })
  .map(
    ({ relativePath, hash }) =>
      new InstallationFile({ relativePath, content: "x", hash: new FileHash(hash) })
  );

const toolIdArb = fc.constantFrom(...(VALID_TOOL_IDS as ToolId[]));

const toolEntryArb = fc.record({
  toolId: toolIdArb,
  version: fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => !s.includes("\n") && s.trim().length > 0),
  files: fc.array(installationFileArb, { maxLength: 6 }),
});

/** Deduplicates by toolId, last one winning, the way `addTool` does. */
function buildManifest(
  tools: Array<{ toolId: ToolId; version: string; files: InstallationFile[] }>
): Manifest {
  const m = Manifest.create();
  for (const t of tools) {
    m.addTool(t.toolId, t.version, t.files);
  }
  return m;
}

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

  it("fromJSON on v6 input round-trips cleanly (guard is a no-op at the supported version)", () => {
    fc.assert(
      fc.property(fc.array(toolEntryArb, { maxLength: 4 }), (tools) => {
        const m = buildManifest(tools);
        const v6 = m.toJSON();
        const once = Manifest.fromJSON(v6).toJSON();
        const twice = Manifest.fromJSON(once).toJSON();
        expect(twice).toEqual(once);
      }),
      { numRuns: 100 }
    );
  });
});
