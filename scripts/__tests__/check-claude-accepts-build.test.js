const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");

const { check, verdict } = require("../check-claude-accepts-build.cjs");

describe("the verdict is read from the host's text, never its exit code", () => {
  it("reads a refusal", () => {
    assert.equal(verdict("  ❯ name: Expected string\n\n✘ Validation failed\n"), "failed");
  });

  it("reads an acceptance, warnings included", () => {
    assert.equal(verdict("  ❯ plugins[7].recommended: Unknown field\n\n✔ Validation passed with warnings\n"), "passed");
  });

  it("says unknown when the host said neither", () => {
    assert.equal(verdict("command not found: claude\n"), "unknown");
  });
});

/** A `claude` stand-in that prints `answer` whatever it is asked, plus a CLI stand-in that
 * writes one file under `--out` so the translation step has something to hand over. Both are
 * node scripts, so the same fakes run on Windows. */
function fakes(answer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-accepts-"));
  const claude = path.join(dir, "claude.js");
  fs.writeFileSync(claude, `process.stdout.write(${JSON.stringify(`${answer}\n`)});\n`);
  const host = [process.execPath, claude];
  const cli = path.join(dir, "cli.js");
  fs.writeFileSync(
    cli,
    'const fs = require("node:fs"); const out = process.argv[process.argv.indexOf("--out") + 1];\n' +
      'fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(`${out}/built`, "");\n',
  );
  const lines = [];
  return { dir, host, cli, log: (text) => lines.push(text), lines };
}

describe("the exit code follows the verdict", () => {
  it("exits 0 when the host accepts the build", () => {
    const f = fakes("✔ Validation passed");
    assert.equal(check({ root: f.dir, cli: f.cli, host: f.host, log: f.log }), 0);
  });

  it("exits 1 when the host refuses it", () => {
    const f = fakes("✘ Validation failed");
    assert.equal(check({ root: f.dir, cli: f.cli, host: f.host, log: f.log }), 1);
  });

  it("exits 2 when the host says neither, and says so", () => {
    const f = fakes("something else entirely");
    assert.equal(check({ root: f.dir, cli: f.cli, host: f.host, log: f.log }), 2);
    assert.match(f.lines.join(""), /NO VERDICT: .* said neither/);
  });

  it("exits 2 when the CLI is not built, without asking the host", () => {
    const f = fakes("✔ Validation passed");
    const code = check({ root: f.dir, cli: path.join(f.dir, "missing.js"), host: f.host, log: f.log });
    assert.equal(code, 2);
    assert.match(f.lines.join(""), /not built/);
  });
});
