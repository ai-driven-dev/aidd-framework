const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const SINK = path.join(ROOT, "plugins/aidd-telemetry/skills/01-cost/scripts/lib/sink.js");
const LIMITS_DOC = path.join(ROOT, "docs/telemetry-limits.md");
const PLUGIN_README = path.join(ROOT, "plugins/aidd-telemetry/README.md");

/** Re-required so it reads the sentinel HOME set just before, the same way its own
 * per-call `process.env` read works when the real hook runs it. */
function actualDefaultRootDir() {
  delete process.env.AIDD_USER_CONFIG_DIR;
  const original = process.env.HOME;
  process.env.HOME = "/sentinel-home";
  delete require.cache[require.resolve(SINK)];
  const dir = require(SINK).rootDir();
  process.env.HOME = original;
  return dir;
}

describe("the documented figures location matches what the sink actually writes", () => {
  const actual = actualDefaultRootDir();
  const documented = actual.replace("/sentinel-home", "~");

  it("computes the well-known default - a change here means the docs must change too", () => {
    assert.equal(actual, "/sentinel-home/.config/aidd/telemetry");
  });

  for (const [label, docPath] of [
    ["docs/telemetry-limits.md", LIMITS_DOC],
    ["plugins/aidd-telemetry/README.md", PLUGIN_README],
  ]) {
    it(`${label} states the exact default path the code writes`, () => {
      const text = fs.readFileSync(docPath, "utf8");
      assert.ok(text.includes(documented), `expected ${label} to say "${documented}"`);
      assert.ok(text.includes("AIDD_USER_CONFIG_DIR"), `expected ${label} to name the override`);
    });
  }
});
