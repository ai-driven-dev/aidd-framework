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
 * This file used to build the plugin's install shape four different ways (flat,
 * hyphen-flat, native, either inside a host project declaring `type: module`), copy
 * `skills/` into each, spawn every script under it in a hermetic environment, and assert
 * each one started cleanly — because a script could reach a sibling by a relative path
 * that only resolves under one of those shapes, and that was worth proving per shape.
 *
 * 00-init (phase 3), 01-cost (phase 1) and 02-check (phase 5) each moved their script to
 * `aidd` and none of the three left one behind, so every one of those four builders,
 * `runScript`, `assertStarted`, `hermeticEnv` and the `git`-resolving `GIT_DIR` ran for
 * nothing: `discoverScripts` always found an empty list, whichever shape it was handed,
 * because the shape never changes what is inside `skills/` — only where it sits. Four
 * `describeShape` calls each asserting `scripts` is `[]` pinned the same fact five times
 * with none of the machinery around it ever exercised.
 *
 * What is still worth pinning is the fact itself: a skill in this plugin ships no script
 * of its own. If one ever does again, the shape-specific harness this replaced is
 * `git log -p -- scripts/__tests__/plugin-install-shape.test.js` from before this change.
 */
describe("the plugin ships no skill scripts, now that every skill calls the CLI instead", () => {
  it("no skill's scripts/ directory holds a .cjs file", () => {
    assert.deepEqual(discoverScripts(SKILLS_DIR), []);
  });
});
