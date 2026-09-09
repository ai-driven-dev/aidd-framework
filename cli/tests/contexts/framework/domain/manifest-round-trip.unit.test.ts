// Each fixture is a byte-for-byte capture of a real manifest, so a rewritten shape that is
// merely self-consistent — which a fixed-point test would still pass — fails here.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";

const FIXTURES_DIR = join(__dirname, "../../../fixtures/manifests");

function fixtureNames(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

describe("Manifest round-trip: every fixture rewrites byte-identical", () => {
  it.each(fixtureNames())("%s", (name) => {
    const path = join(FIXTURES_DIR, name);
    const original = readFileSync(path, "utf-8");

    const manifest = Manifest.fromJSON(JSON.parse(original));
    const rewritten = `${JSON.stringify(manifest.toJSON(), null, 2)}\n`;

    expect(rewritten).toBe(original);
  });

  it("covers at least one fixture per manifest member", () => {
    const names = fixtureNames();
    expect(names).toContain("multi-tool.json");
    expect(names).toContain("merge-files.json");
    expect(names).toContain("mcp-exclusions.json");
    expect(names).toContain("plugins.json");
    expect(names).toContain("full.json");
  });
});
