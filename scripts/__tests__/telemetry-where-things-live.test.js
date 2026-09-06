const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

// A killed run never fires its `after` hooks, so its temp directories survive. Swept here at
// module load rather than in a hook: the age bound in the sweep means it can only ever touch
// a directory from an earlier run, so it is safe wherever in the order this file lands.
require("../sweep-stale-test-dirs.cjs").sweepStaleTestDirs();

const ROOT = path.resolve(__dirname, "../..");

/** Where the figures land is pinned in
 * cli/tests/contexts/telemetry/infrastructure/telemetry-sink-location.unit.test.ts, since
 * the sink that writes them now lives only in the CLI. What is left here is about the
 * plugin's own shape: what each skill carries, and that nothing reaches across. */

describe("a library a skill needs is carried by that skill, identically", () => {
  // There used to be a walk here checking that no skill's own script `require()`d code
  // outside its folder. It only ever looked at `.js` files, and this plugin's skills carry
  // none — every script under `skills/` is `.cjs` (see the marker test below), and since
  // phase 3/5 there are none of those either: `plugin-install-shape.test.js`'s "ships no
  // skill scripts" already pins that a skill carries zero scripts of its own. A boundary
  // check with nothing to walk cannot fail on any input, .js or .cjs; it is dropped rather
  // than widened to a corpus this repository does not have, and its invariant reappears the
  // day a skill ships a script again, in whichever test adds the corpus back.

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

/**
 * Every script path this repository *names* must exist.
 *
 * `plugin-install-shape.test.js` walks the scripts that exist and runs them; it cannot see a
 * reference to one that does not. `check-markdown-links.js` walks `[text](target)` links; a
 * command inside a fenced block is invisible to it. Between those two walks sits a gap that
 * has now swallowed the same defect twice: the plugin README told people to run
 * `telemetry-report.cjs` for two phases after it was deleted, and `cli-ci.yml`'s Windows job
 * executed it and `telemetry-switch.cjs` — red before anyone looked.
 *
 * This inverts the walk: start from what is written down, and require the file.
 */
describe("a script path this repository names is a script that exists", () => {
  const ROOT_DIR = path.resolve(__dirname, "../..");
  const PLUGIN_DIR = path.join(ROOT_DIR, "plugins/aidd-telemetry");
  const SEARCHED = ["plugins/aidd-telemetry", "docs", ".github/workflows", "README.md"];

  // Only the two forms that have actually broken. A bare fragment in prose ("hooks/journal.cjs"
  // describing a layout) is not a reference anyone runs, and asserting it would make this
  // guard cry wolf until someone deletes it.
  //
  //   plugins/…/x.cjs      repo-rooted, what cli-ci.yml executes
  //   <plugin>/…/x.cjs     the README's own form, where <plugin> is the installed plugin root
  // `scripts` is deliberately absent: it is both a repo directory and the conventional
  // subdirectory inside every skill, so `scripts/telemetry-check.cjs` in a skill's own
  // markdown is relative to that skill and resolves nowhere from here.
  const REPO_ROOTED = /(?:^|[\s"'`(])((?:plugins|cli|docs)\/[\w./-]+\.(?:cjs|mjs))/gmu;
  const PLUGIN_ROOTED = /<plugin>\/([\w./-]+\.(?:cjs|mjs))/gmu;

  function textFiles(target) {
    const full = path.join(ROOT_DIR, target);
    if (!fs.existsSync(full)) return [];
    if (fs.statSync(full).isFile()) return [full];
    const found = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const child = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (/\.(md|ya?ml)$/u.test(entry.name)) found.push(child);
      }
    };
    walk(full);
    return found;
  }

  function missingReferences() {
    const missing = [];
    for (const target of SEARCHED) {
      for (const file of textFiles(target)) {
        const text = fs.readFileSync(file, "utf8");
        const where = path.relative(ROOT_DIR, file);
        for (const match of text.matchAll(REPO_ROOTED)) {
          if (!fs.existsSync(path.join(ROOT_DIR, match[1]))) {
            missing.push(`${where} names ${match[1]}`);
          }
        }
        for (const match of text.matchAll(PLUGIN_ROOTED)) {
          if (!fs.existsSync(path.join(PLUGIN_DIR, match[1]))) {
            missing.push(`${where} names <plugin>/${match[1]}`);
          }
        }
      }
    }
    return missing;
  }

  it("names no script that has been deleted", () => {
    assert.deepEqual(missingReferences(), []);
  });

  it("detects a named-but-absent script, on both forms", () => {
    // The guard's own proof: run the two patterns over text that names files which do not
    // exist, and require both to be reported. Asserting only that the two real scripts are
    // gone would pass even if the detection below were broken.
    const planted = [
      "run: node plugins/aidd-telemetry/skills/00-init/scripts/telemetry-switch.cjs on",
      "node <plugin>/skills/01-cost/scripts/telemetry-report.cjs read",
    ].join("\n");

    const repoRooted = [...planted.matchAll(REPO_ROOTED)].map((match) => match[1]);
    const pluginRooted = [...planted.matchAll(PLUGIN_ROOTED)].map((match) => match[1]);

    assert.equal(repoRooted.length, 1, "the repo-rooted form must be seen");
    assert.equal(pluginRooted.length, 1, "the <plugin>-rooted form must be seen");
    assert.ok(!fs.existsSync(path.join(ROOT_DIR, repoRooted[0] ?? "")));
    assert.ok(!fs.existsSync(path.join(PLUGIN_DIR, pluginRooted[0] ?? "")));
  });
});
