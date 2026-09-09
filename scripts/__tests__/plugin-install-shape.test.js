const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const SKILLS_DIR = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills");

// Walks each skill's scripts directory one level deep, so a skill's `scripts/lib/`
// internals (only ever require()d, never run directly) are left for the scripts that
// load them to cover.
function discoverScripts(skillsRoot) {
  const found = [];
  for (const skillEntry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!skillEntry.isDirectory()) continue;
    const scriptsDir = path.join(skillsRoot, skillEntry.name, "scripts");
    if (!fs.existsSync(scriptsDir)) continue;
    for (const fileEntry of fs.readdirSync(scriptsDir, { withFileTypes: true })) {
      if (fileEntry.isFile() && fileEntry.name.endsWith(".cjs")) {
        found.push(`${skillEntry.name}/scripts/${fileEntry.name}`);
      }
    }
  }
  return found.sort();
}

/**
 * A skill in this plugin ships no script of its own, every one of them calling `aidd`
 * instead. A harness that built the install shape four ways and ran each skill's scripts
 * under it proved nothing once there were no scripts left to find, since the shape changes
 * only where `skills/` sits and never what is inside it.
 */
describe("the plugin ships no skill scripts, now that every skill calls the CLI instead", () => {
  it("no skill's scripts/ directory holds a .cjs file", () => {
    assert.deepEqual(discoverScripts(SKILLS_DIR), []);
  });
});
