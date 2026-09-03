const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const manifestPath = path.resolve(
  __dirname,
  "../../plugins/aidd-telemetry/.claude-plugin/plugin.json",
);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

test("aidd-telemetry manifest declares its name", () => {
  assert.equal(manifest.name, "aidd-telemetry");
});

test("aidd-telemetry manifest declares no skills", () => {
  assert.ok(!("skills" in manifest), "manifest must not declare a skills array");
});
