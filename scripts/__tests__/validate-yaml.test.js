const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const script = path.resolve(__dirname, "../validate-yaml.mjs");

describe("validate-yaml", () => {
  it("fails on a file YAML cannot load, naming it, and passes a valid multi-document one", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-validate-yaml-"));
    try {
      fs.writeFileSync(path.join(root, "broken.yml"), "key: [unclosed\n");
      fs.writeFileSync(path.join(root, "fine.yml"), "a: 1\n---\nb: [1, 2]\n");

      const broken = spawnSync(process.execPath, [script, "broken.yml"], { cwd: root, encoding: "utf8" });
      assert.equal(broken.status, 1);
      assert.match(broken.stderr, /broken\.yml: /u);

      const fine = spawnSync(process.execPath, [script, "--", "fine.yml"], { cwd: root, encoding: "utf8" });
      assert.equal(fine.status, 0, fine.stderr);
      assert.match(fine.stdout, /passed for 1 file/u);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
