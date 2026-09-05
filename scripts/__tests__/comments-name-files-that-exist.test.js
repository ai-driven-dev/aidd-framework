const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * A doc comment that names a source file is a promise the reader can open it.
 *
 * The CLI pivot deleted 25 files under `plugins/aidd-telemetry/skills/*` and moved the read
 * path into cli/. Thirteen comments went on naming those files in the present tense —
 * "Mirrors the plugin's own session-anchor.cjs", "see that file's own doc comment for the
 * measurements this is not free to re-derive" — so a reader following them found nothing,
 * and worse, read an ongoing parity obligation into a second implementation that no longer
 * exists. This is the guard that stops it coming back.
 *
 * Only backticked tokens that look like a source file are checked: a token naming a runtime
 * path (`.aidd/config.json`, `~/.codex/config.toml`) names something written at runtime, not
 * a file in this repository, and is none of this test's business.
 */

/** Where a mention is deliberate history rather than a dangling pointer: the file is named
 * as gone, or named by a test asserting it is gone. Listed one by one rather than inferred
 * from nearby words like "deleted", so adding one is a decision somebody makes on purpose. */
const NAMED_AS_HISTORY = Object.freeze({
  "cli/src/application/display/telemetry-check-display.ts": ["diagnose.cjs"],
  "cli/src/domain/models/telemetry-claim.ts": ["diagnose.cjs"],
  "cli/src/infrastructure/adapters/hook-trust-reader-adapter.ts": ["hook-trust.cjs"],
  "cli/src/infrastructure/adapters/person-identity-adapter.ts": ["identity.cjs"],
  "cli/src/domain/models/session-anchor.ts": ["session-anchor.cjs"],
  "cli/tests/e2e/telemetry-check.e2e.test.ts": ["telemetry-check.cjs"],
  "cli/tests/e2e/telemetry-identity.e2e.test.ts": ["telemetry-identity.cjs"],
  "cli/tests/e2e/telemetry-lifecycle.e2e.test.ts": ["telemetry-switch.cjs"],
  "cli/tests/e2e/telemetry-on-runs-privacy.e2e.test.ts": [
    "journal-privacy.cjs",
    "aidd-telemetry-switch-gitignore.test.js",
  ],
  "cli/tests/infrastructure/adapters/telemetry-sink-location.unit.test.ts": ["sink.cjs"],
  "scripts/__tests__/aidd-telemetry-cost-skill.test.js": ["telemetry-report.cjs"],
  "scripts/__tests__/plugin-install-shape.test.js": [
    "telemetry-switch.cjs",
    "telemetry-identity.cjs",
    "telemetry-check.cjs",
  ],
  "scripts/__tests__/telemetry-where-things-live.test.js": [
    "scripts/telemetry-check.cjs",
    "telemetry-report.cjs",
    "telemetry-switch.cjs",
  ],
});

/** Named inside a fixture or a runtime path a test builds, never a file of this repository. */
const NOT_A_REPOSITORY_FILE = Object.freeze({
  // A seam artefact one plugin writes into a reader's own project and another reads back —
  // named here as the shape of that seam, never as a file this repository holds.
  "docs/ARCHITECTURE.md": ["INSTALL.md"],
  "docs/CATALOG.md": ["INSTALL.md"],
  "cli/tests/application/use-cases/doctor-use-case.unit.test.ts": ["@.claude/rules/test.md"],
  "cli/tests/e2e/telemetry-plugin-standalone.e2e.test.ts": [
    "dist/cli.js",
    "aidd_docs/tasks/2026_08/2026_08_21_probe-task/notes.md",
  ],
});

const SOURCE_FILE_TOKEN = /^[\w./@-]+\.(?:ts|cjs|js|md)$/u;
const BACKTICKED = /`([^`\n]+)`/gu;

function trackedFiles() {
  return cp.execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
}

function scannedFiles() {
  const found = cp.execSync(
    "find cli/src cli/tests plugins scripts -type f " +
      "\\( -name '*.ts' -o -name '*.cjs' -o -name '*.js' \\) -not -path '*/node_modules/*'; " +
      // docs/ too, and its markdown alone. A durable doc naming a file makes the same
      // promise a comment does, and it was the one place nothing kept it: the architecture
      // doc named the context plugin's session hook with a cjs extension for a file that has
      // always been js. Markdown anywhere else is deliberately out - a skill's own asset and
      // a fixture template name illustrative paths on purpose, and scanning those produced
      // 17 findings of which none was a fault. This comment itself is why the names above
      // are spelled out in prose rather than quoted: a quoted example would be a finding.
      "find docs -type f -name '*.md'",
    { cwd: ROOT, encoding: "utf8" }
  );
  return found.trim().split("\n");
}

function allowed(file, token) {
  return (
    (NAMED_AS_HISTORY[file] ?? []).includes(token) ||
    (NOT_A_REPOSITORY_FILE[file] ?? []).includes(token)
  );
}

/** Every way a token could legitimately name something real: the exact tracked path, a path
 * relative to the file doing the naming, one relative to `cli/`, or a bare basename that
 * belongs to some tracked file. The last is deliberately generous — a comment saying
 * `repo.cjs` names a real file without spelling out where it sits. */
function namesSomethingReal(token, file, tracked, basenames) {
  if (tracked.has(token)) return true;
  const relativeToNamer = path.posix.normalize(path.posix.join(path.posix.dirname(file), token));
  if (tracked.has(relativeToNamer)) return true;
  if (tracked.has(path.posix.normalize(path.posix.join("cli", token)))) return true;
  return basenames.has(path.basename(token));
}

/** Every `.js` file the plugin's hooks actually ship. One, today: everything else there is
 * `.cjs`, because the hooks run as CommonJS while OpenCode's loader needs an ESM entry. */
function hookJsFiles(tracked) {
  return new Set(
    [...tracked]
      .filter((file) => file.startsWith("plugins/aidd-telemetry/hooks/") && file.endsWith(".js"))
      .map((file) => path.basename(file))
  );
}

/**
 * The same rule as below, for a mention that carries no backticks.
 *
 * Comments in the hooks named journal.js, record.js, host.js, codex.js and index.js;
 * every one of those files is .cjs, and the backtick rule below saw none of
 * them — some sat in parentheses, one in a test's own name. The hooks directory is the one
 * place a narrow rule is safe: it ships exactly one `.js` file, so any other such name
 * anywhere in it, or in the tests that describe it, is a `.cjs` written wrong.
 */
describe("a comment about the hooks names .cjs where the file is .cjs", () => {
  it("names no <name>.js that the hooks do not actually ship", () => {
    const tracked = new Set(trackedFiles());
    const shipped = hookJsFiles(tracked);
    const basenames = new Set([...tracked].map((file) => path.basename(file)));
    const scanned = [...tracked].filter(
      (file) =>
        file.startsWith("plugins/aidd-telemetry/hooks/") ||
        file.startsWith("scripts/__tests__/opencode-plugin") ||
        file.startsWith("scripts/__tests__/aidd-telemetry-journal")
    );
    const wrong = [];

    for (const file of scanned) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      // `[\w.-]+`, not `[\w-]+`: a filename can carry dots of its own, and capturing only
      // the last segment read aidd-telemetry-journal.test.js as test.js and flagged a
      // file that exists.
      for (const match of text.matchAll(/([\w.-]+)\.js\b/gu)) {
        const named = `${match[1]}.js`;
        // A path inside a fixture or an assertion about somebody else's project file is not
        // a claim about this plugin's own layout.
        if (named === "index.js" && text.includes("/src/index.js")) continue;
        if (shipped.has(named)) continue;
        if (basenames.has(named)) continue;
        // Inside the hooks, every module is `.cjs`; `opencode-plugin.js` is the single
        // exception, and it is in `shipped` above. So any other such name here is a
        // `.cjs` written wrong — including a placeholder like `<host>.js`, which no lookup
        // against a real filename could ever have caught.
        if (file.startsWith("plugins/aidd-telemetry/hooks/")) {
          wrong.push(`${file} names ${named}, and every module in hooks/ is .cjs`);
          continue;
        }
        if (tracked.has(`plugins/aidd-telemetry/hooks/lib/${match[1]}.cjs`)) {
          wrong.push(`${file} names ${named}, but the file it means is ${match[1]}.cjs`);
        }
      }
    }

    assert.deepEqual(wrong, []);
  });
});

describe("a comment that names a source file names one that exists", () => {
  it("names no file the repository does not hold, outside the mentions listed as history", () => {
    const tracked = new Set(trackedFiles());
    const basenames = new Set([...tracked].map((file) => path.basename(file)));
    const dangling = [];

    for (const file of scannedFiles()) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const match of text.matchAll(BACKTICKED)) {
        const token = match[1].trim();
        if (!SOURCE_FILE_TOKEN.test(token)) continue;
        if (namesSomethingReal(token, file, tracked, basenames)) continue;
        if (allowed(file, token)) continue;
        dangling.push(`${file} names \`${token}\`, which no tracked file matches`);
      }
    }

    assert.deepEqual(
      dangling,
      [],
      `A comment points at a file that is not there. Either fix the comment to name what ` +
        `actually holds the fact now, or - if the mention is deliberate history - add it to ` +
        `NAMED_AS_HISTORY with the file it sits in.\n${dangling.join("\n")}`
    );
  });

  it("lists no allowance for a file that does exist, so the list cannot outlive its reason", () => {
    const tracked = new Set(trackedFiles());
    const basenames = new Set([...tracked].map((file) => path.basename(file)));
    const stale = [];

    for (const [file, tokens] of Object.entries(NAMED_AS_HISTORY)) {
      for (const token of tokens) {
        if (namesSomethingReal(token, file, tracked, basenames)) {
          stale.push(`${file} is allowed to name \`${token}\`, but that file exists again`);
        }
      }
    }

    assert.deepEqual(stale, []);
  });

  it("lists no allowance for a file that stopped naming it", () => {
    const unused = [];

    for (const list of [NAMED_AS_HISTORY, NOT_A_REPOSITORY_FILE]) {
      for (const [file, tokens] of Object.entries(list)) {
        const text = fs.readFileSync(path.join(ROOT, file), "utf8");
        for (const token of tokens) {
          if (!text.includes(`\`${token}\``)) {
            unused.push(`${file} no longer names \`${token}\` - drop it from the list`);
          }
        }
      }
    }

    assert.deepEqual(unused, []);
  });
});
