const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * A skill ships two ways and a relative path survives only one of them: the tree ships flat
 * and as a marketplace. `check-markdown-links.js` resolves every link against this
 * repository, where the target does exist, so a link reaching out of a skill passes there
 * and is dead in every installed copy.
 *
 * The skill's own directory is the boundary, not the plugin's. A link to a sibling skill, to
 * the plugin's README, or to anything in the repository is equally unreachable once a tool
 * has installed the skill somewhere of its own choosing; name the file in prose instead.
 */

const SKILL_ROOT = /^plugins\/[^/]+\/skills\/[^/]+$/u;

/** Markdown link targets that are relative paths — not anchors, not URLs, not mail. */
const RELATIVE_LINK = /\]\((\.[^)\s]*)\)/gu;

function everyMarkdownUnderPlugins(directory, into) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) everyMarkdownUnderPlugins(full, into);
    else if (entry.name.endsWith(".md")) into.push(full);
  }
  return into;
}

/** The skill directory a file belongs to, or `null` for a file outside every skill —
 * a plugin's own README, an agent, a command, which ship by different rules. */
function skillRootOf(relativePath) {
  const segments = relativePath.split("/");
  const root = segments.slice(0, 4).join("/");
  return SKILL_ROOT.test(root) ? root : null;
}

function linksLeavingTheirSkill() {
  const escaping = [];
  for (const file of everyMarkdownUnderPlugins(path.join(ROOT, "plugins"), [])) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    const root = skillRootOf(relative);
    if (root === null) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const [, target] of text.matchAll(RELATIVE_LINK)) {
      const resolved = path
        .normalize(path.join(path.dirname(relative), target.split("#")[0]))
        .split(path.sep)
        .join("/");
      if (resolved !== root && !resolved.startsWith(`${root}/`)) {
        escaping.push(`${relative} -> ${target}`);
      }
    }
  }
  return escaping;
}

describe("a skill links only inside itself", () => {
  it("has no markdown link reaching out of the skill that ships it", () => {
    assert.deepEqual(
      linksLeavingTheirSkill(),
      [],
      "a relative link out of a skill is dead in every installed copy — name the file in prose instead",
    );
  });

  // The guard has to be able to see one. A checker that resolves every path against this
  // repository, the way `check-markdown-links.js` does, reports nothing here at all.
  it("sees an escaping link when one is put in front of it", () => {
    const root = path.join(ROOT, "plugins", "aidd-dev", "skills", "01-plan");
    const probe = path.join(root, "escaping-link-probe.md");
    fs.writeFileSync(probe, "[out](../../../../README.md)\n", "utf8");
    try {
      const found = linksLeavingTheirSkill();
      assert.ok(
        found.some((entry) => entry.includes("escaping-link-probe.md")),
        `the probe was not detected; found: ${JSON.stringify(found)}`,
      );
    } finally {
      fs.rmSync(probe);
    }
  });
});
