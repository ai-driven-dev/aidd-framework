const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/** Where the figures land is pinned in cli/tests/infrastructure/adapters/
 * telemetry-sink-location.unit.test.ts, since the sink that writes them now lives only in the
 * CLI. What is left here is about the plugin's own shape: what each skill carries, and that
 * nothing reaches across. */

describe("a library a skill needs is carried by that skill, identically", () => {
  const SKILLS = path.join(ROOT, "plugins/aidd-telemetry/skills");
  it("no skill reaches outside its own folder to require code", () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".js")) {
          for (const m of fs.readFileSync(full, "utf8").matchAll(/require\("(\.\.[^"]*)"\)/gu)) {
            const resolved = path.resolve(path.dirname(full), m[1]);
            if (!resolved.startsWith(path.join(SKILLS, path.relative(SKILLS, full).split(path.sep)[0]))) {
              offenders.push(`${path.relative(SKILLS, full)} -> ${m[1]}`);
            }
          }
        }
      }
    };
    walk(SKILLS);
    assert.deepEqual(offenders, []);
  });

  /** No `package.json` marker anywhere: every CommonJS file this plugin ships is named
   * `.cjs`, which Node reads as CommonJS whatever the host project declares. A marker is a
   * property of a directory and a rename can move a file out from under it; an extension
   * travels with the file. The one exception is the ESM entry OpenCode discovers by glob
   * (`{plugin,plugins}/*.{ts,js}`), which must stay `.js` and is genuine ESM anyway. */
  it("declares its module system per file, so no directory marker can be lost", () => {
    const PLUGIN = path.join(ROOT, "plugins/aidd-telemetry");
    const scripts = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|cjs|mjs)$/u.test(entry.name))
          scripts.push(path.relative(PLUGIN, full).split(path.sep).join("/"));
        else if (entry.name === "package.json" && dir !== PLUGIN) {
          assert.fail(`${path.relative(PLUGIN, full)}: no directory marker, name the file .cjs`);
        }
      }
    };
    walk(PLUGIN);
    assert.deepEqual(
      scripts.filter((f) => f.endsWith(".js")),
      ["hooks/opencode-plugin.js"]
    );
  });
});
