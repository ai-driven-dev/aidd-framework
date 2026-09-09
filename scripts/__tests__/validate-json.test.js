const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { describe, it } = require("node:test");

const script = path.resolve(__dirname, "../validate-json.mjs");
// A bare absolute path is not an import specifier on Windows, where it reads as a `d:` scheme.
const scriptUrl = pathToFileURL(script).href;

async function validator(root, loadSchema) {
  const { createValidator } = await import(scriptUrl);
  return createValidator({ root, loadSchema });
}

const offline = async () => {
  throw new Error("offline");
};

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-validate-json-"));
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(root, ...file.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  return root;
}

const manifest = (skills) => ({
  name: "sample",
  version: "1.0.0",
  description: "a sample",
  repository: "https://example.invalid/repo",
  homepage: "https://example.invalid",
  license: "MIT",
  author: { name: "someone" },
  skills,
});

describe("validate-json", () => {
  it("routes a plugin manifest, a marketplace and a settings file to their schema, and a plain file to none", async () => {
    const { schemaFor } = await import(scriptUrl);
    assert.equal(schemaFor("plugins/x/.claude-plugin/plugin.json").type, "pluginManifest");
    assert.equal(schemaFor(".claude-plugin/marketplace.json").type, "marketplace");
    assert.equal(schemaFor(".claude/settings.local.json").type, "claudeSettings");
    assert.equal(schemaFor(path.join("plugins", "x", ".claude-plugin", "plugin.json")).type, "pluginManifest");
    assert.equal(schemaFor("package.json"), null);
  });

  it("falls back to the local rules when the schema cannot be fetched, and names a skill path that is not there", async () => {
    const root = tree({
      "plugins/sample/.claude-plugin/plugin.json": manifest(["./skills/present", "./skills/absent"]),
      "plugins/sample/skills/present/SKILL.md": "# present\n",
    });
    try {
      const v = await validator(root, offline);
      await v.validate(path.join("plugins", "sample", ".claude-plugin", "plugin.json"));
      assert.equal(v.warnings.length, 1);
      assert.match(v.warnings[0], /using local fallback \(offline\)/u);
      assert.deepEqual(
        v.errors.map((e) => e.split(": ").slice(1).join(": ")),
        ["skill path does not exist: ./skills/absent"]
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("applies the fetched schema when there is one, and reports what it rejects", async () => {
    const root = tree({ "plugins/sample/.claude-plugin/plugin.json": { name: 7 } });
    try {
      const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
      const v = await validator(root, async () => schema);
      await v.validate(path.join("plugins", "sample", ".claude-plugin", "plugin.json"));
      assert.deepEqual(v.warnings, []);
      assert.equal(v.errors.length, 1);
      assert.match(v.errors[0], /\/name must be string/u);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("names a marketplace plugin listed twice and a source that is not there", async () => {
    const plugin = { name: "dup", version: "1.0.0", source: "./plugins/dup", description: "d", strict: true, metadata: { recommended: false } };
    const root = tree({
      ".claude-plugin/marketplace.json": { name: "m", version: "1.0.0", description: "d", owner: { name: "o" }, plugins: [plugin, plugin] },
    });
    try {
      const v = await validator(root, offline);
      await v.validate(path.join(".claude-plugin", "marketplace.json"));
      const messages = v.errors.map((e) => e.split(": ").slice(1).join(": "));
      assert.ok(messages.includes("duplicate plugin name: dup"), messages.join("\n"));
      assert.equal(messages.filter((m) => m.startsWith("plugins[0].source does not exist")).length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes the repository's own manifests through the local fallback, so an offline runner agrees with an online one", async () => {
    const root = path.resolve(__dirname, "../..");
    const v = await validator(root, offline);
    await v.validate(path.join(".claude-plugin", "marketplace.json"));
    for (const plugin of fs.readdirSync(path.join(root, "plugins"))) {
      await v.validate(path.join("plugins", plugin, ".claude-plugin", "plugin.json"));
    }
    assert.deepEqual(v.errors, []);
  });

  it("fails the CLI on a file that is not JSON, naming it, and passes a plain valid one", () => {
    const root = tree({ "broken.json": "{ not json", "fine.json": { ok: true } });
    try {
      const broken = spawnSync(process.execPath, [script, "broken.json"], { cwd: root, encoding: "utf8" });
      assert.equal(broken.status, 1);
      assert.match(broken.stderr, /broken\.json: invalid JSON/u);
      const fine = spawnSync(process.execPath, [script, "fine.json"], { cwd: root, encoding: "utf8" });
      assert.equal(fine.status, 0, fine.stderr);
      assert.match(fine.stdout, /passed for 1 file/u);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
