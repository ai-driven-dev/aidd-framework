// The strongest available net for a model change that must not move the document:
// each fixture under tests/fixtures/manifests/ was captured, byte for byte, from the
// pre-split Manifest. If the split changes what toJSON() produces for any of the six
// members, the rewritten bytes stop matching the committed ones and this test fails —
// unlike a fixed-point test (serialize(parse(x)) === serialize(parse(parse(x)))), which
// stays green even if the new shape is merely self-consistent.
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
