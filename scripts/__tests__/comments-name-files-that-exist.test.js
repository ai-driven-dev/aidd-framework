const assert = require("node:assert/strict");
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const { REPO_ROOT: ROOT, repositoryPathExists } = require("../lib/repository-path.cjs");

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
  "cli/src/presentation/display/telemetry-check-display.ts": ["diagnose.cjs"],
  "cli/src/contexts/telemetry/domain/telemetry-claim.ts": ["diagnose.cjs"],
  "cli/src/contexts/telemetry/infrastructure/hook-trust-reader-adapter.ts": ["hook-trust.cjs"],
  "cli/src/contexts/telemetry/infrastructure/person-identity-adapter.ts": ["identity.cjs"],
  "cli/src/contexts/telemetry/domain/session-anchor.ts": ["session-anchor.cjs"],
  "cli/tests/e2e/telemetry-check.e2e.test.ts": ["telemetry-check.cjs"],
  "cli/tests/e2e/telemetry-identity.e2e.test.ts": ["telemetry-identity.cjs"],
  "cli/tests/e2e/telemetry-lifecycle.e2e.test.ts": ["telemetry-switch.cjs"],
  "cli/tests/e2e/telemetry-on-runs-privacy.e2e.test.ts": [
    "journal-privacy.cjs",
    "aidd-telemetry-switch-gitignore.test.js",
  ],
  "cli/tests/contexts/telemetry/infrastructure/telemetry-sink-location.unit.test.ts": ["sink.cjs"],
  "scripts/__tests__/aidd-telemetry-cost-skill.test.js": ["telemetry-report.cjs"],
  "scripts/__tests__/telemetry-where-things-live.test.js": [
    "scripts/telemetry-check.cjs",
    "telemetry-report.cjs",
    "telemetry-switch.cjs",
  ],
});

/** Named inside a fixture or a runtime path a test builds, never a file of this repository. */
const NOT_A_REPOSITORY_FILE = Object.freeze({
  // Illustrations inside a rule's own probe: each names a file deliberately absent, which is
  // what the probe is for — a guard that only ever sees real paths never proves it can see a
  // dead one.
  "cli/tests/architecture/referenced-paths.arch.test.ts": [
    "kernel/gone.ts",
    "widget-mode.ts",
    "finalize-write-use-case.ts",
    "tests/helpers/vitest-text-loader.js",
  ],
  "cli/tests/architecture/earned-sharing.arch.test.ts": ["shared/resolve-marketplace/x.ts"],
  "cli/tests/contexts/framework/application/doctor-use-case.unit.test.ts": [
    "@.claude/rules/test.md",
  ],
  // A seam artefact one plugin writes into a reader's own project and another reads back —
  // named here as the shape of that seam, never as a file this repository holds.
  "docs/ARCHITECTURE.md": ["INSTALL.md"],
  "docs/CATALOG.md": ["INSTALL.md"],
  "cli/tests/e2e/telemetry-plugin-standalone.e2e.test.ts": [
    "dist/cli.js",
    "aidd_docs/tasks/2026_08/2026_08_21_probe-task/notes.md",
  ],
  // A sample written path fed to a payload or a fixture: illustrative, not a claim that
  // `cli/src/index.ts` exists. Tightening the basename fallback for a rooted token (below)
  // newly reaches these; the file the token names is out of this pass's scope, and these
  // four never intended to name a real one in the first place.
  "cli/tests/contexts/telemetry/infrastructure/run-journal-task-declared.integration.test.ts": [
    "cli/src/index.ts",
  ],
  "cli/tests/contexts/telemetry/infrastructure/run-journal-reader-adapter.integration.test.ts": [
    "cli/src/index.ts",
  ],
  "cli/tests/contexts/telemetry/domain/cost-report.unit.test.ts": ["cli/src/index.ts"],
  "cli/tests/contexts/telemetry/domain/task-identity.unit.test.ts": ["cli/src/index.ts"],
});

const SOURCE_FILE_TOKEN = /^[\w./@-]+\.(?:ts|cjs|js|md)$/u;
const BACKTICKED = /`([^`\n]+)`/gu;

/** A `cli/src/...` or `cli/tests/...` path is unambiguous even outside backticks — nothing
 * else in prose is spelled that way by accident. Unlike `SOURCE_FILE_TOKEN`, which only
 * screens a token already isolated by backticks, this pattern has to isolate the token
 * itself, so it requires the `cli/(src|tests)/` prefix a bare mention needs to read as a
 * path at all: a stale `cli/src/domain/models/x.ts` sitting in a plain comment, with no
 * backticks around it, was invisible to the backtick-only scan below it. */
const BARE_SOURCE_TOKEN = /\bcli\/(?:src|tests)\/[\w./-]+\.(?:ts|cjs|js|md)\b/gu;

function trackedFiles() {
  return cp.execSync("git ls-files", { cwd: ROOT, encoding: "utf8" }).trim().split("\n");
}

function findFiles(command) {
  return cp
    .execSync(command, { cwd: ROOT, encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

function scannedFiles() {
  return [
    ...findFiles(
      "find cli/src cli/tests plugins scripts -type f " +
        "\\( -name '*.ts' -o -name '*.cjs' -o -name '*.js' \\) -not -path '*/node_modules/*'"
    ),
    // docs/ too, and its markdown alone. A durable doc naming a file makes the same promise
    // a comment does, and it was the one place nothing kept it: the architecture doc named
    // the context plugin's session hook with a cjs extension for a file that has always been
    // js. Markdown anywhere else is deliberately out - a skill's own asset and a fixture
    // template name illustrative paths on purpose, and scanning those produced 17 findings of
    // which none was a fault. This comment itself is why the names above are spelled out in
    // prose rather than quoted: a quoted example would be a finding.
    //
    // Two calls and not one command joined by `;`: `execSync` runs through `cmd.exe` on
    // Windows, where `;` separates nothing and the second `find` was passed to the first as
    // an argument. Green on macOS, red on the Windows job, which is exactly what that job is
    // there for.
    ...findFiles("find docs -type f -name '*.md'"),
  ];
}

function allowed(file, token) {
  return (
    (NAMED_AS_HISTORY[file] ?? []).includes(token) ||
    (NOT_A_REPOSITORY_FILE[file] ?? []).includes(token)
  );
}

/** A token spelled out from the repository root: it claims to be the whole path, not a
 * shorthand, so the basename fallback below must not excuse it. Mirrors the prefix
 * `BARE_SOURCE_TOKEN` requires — the one shape a stale mention can take while still reading
 * as unambiguous. */
const ROOTED_TOKEN = /^cli\/(?:src|tests)\//u;

/** Every way a token could legitimately name something real: the exact tracked path, a path
 * relative to the file doing the naming, one relative to `cli/`, or — for a token that is
 * not itself rooted at `cli/src/` or `cli/tests/` — a bare basename that belongs to some
 * tracked file.
 *
 * That last check is deliberately generous: `repo.cjs` and `hooks/opencode-plugin.js` both
 * name a real file by less than its full path, and a reader recognises them anyway. But it
 * must not run for a token already spelled as a full repository path — `cli/src/domain/
 * models/x.ts` naming basename `x.ts` would pass just because some unrelated tracked file
 * happens to be called that today, which is the blind spot this comment used to leave open.
 * A rooted token that fails every check above it names nothing real, full stop. */
function namesSomethingReal(token, file, tracked, basenames) {
  if (tracked.has(token)) return true;
  const relativeToNamer = path.posix.normalize(path.posix.join(path.posix.dirname(file), token));
  if (tracked.has(relativeToNamer)) return true;
  if (tracked.has(path.posix.normalize(path.posix.join("cli", token)))) return true;
  // Shared with script-tests-name-cli-files-that-exist.test.js: a real file this repository
  // holds, whether or not `git ls-files` has caught up with it yet.
  if (repositoryPathExists(token)) return true;
  if (ROOTED_TOKEN.test(token)) return false;
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

/** This file's own path: excluded from the scan below. The two allowlists it defines carry,
 * as literal string values, the very tokens this rule exists to flag — a
 * `NOT_A_REPOSITORY_FILE` entry names the illustrative path it excuses, verbatim, so the
 * lookup can match it; that is a catalog entry, not this file claiming the path is real, the
 * same distinction `errors-that-are-thrown.arch.test.ts` draws by excluding
 * `kernel/errors.ts` from its own search for a class that throws itself. */
const SELF = "scripts/__tests__/comments-name-files-that-exist.test.js";

describe("a comment that names a source file names one that exists", () => {
  it("names no file the repository does not hold, outside the mentions listed as history", () => {
    const tracked = new Set(trackedFiles());
    const basenames = new Set([...tracked].map((file) => path.basename(file)));
    const dangling = [];

    for (const file of scannedFiles().filter((candidate) => candidate !== SELF)) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const match of text.matchAll(BACKTICKED)) {
        const token = match[1].trim();
        if (!SOURCE_FILE_TOKEN.test(token)) continue;
        if (namesSomethingReal(token, file, tracked, basenames)) continue;
        if (allowed(file, token)) continue;
        dangling.push(`${file} names \`${token}\`, which no tracked file matches`);
      }
      for (const match of text.matchAll(BARE_SOURCE_TOKEN)) {
        const token = match[0];
        if (namesSomethingReal(token, file, tracked, basenames)) continue;
        if (allowed(file, token)) continue;
        dangling.push(`${file} names ${token} (no backticks), which no tracked file matches`);
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

    for (const [file, tokens] of Object.entries(NAMED_AS_HISTORY)) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const token of tokens) {
        if (!text.includes(`\`${token}\``)) {
          unused.push(`${file} no longer names \`${token}\` - drop it from the list`);
        }
      }
    }

    // NOT_A_REPOSITORY_FILE allows tokens that need not be backtick-wrapped: a fixture's
    // illustrative path sits inside a string literal, not behind a documentation backtick.
    // Checked by plain substring instead of the backtick wrapper NAMED_AS_HISTORY needs.
    for (const [file, tokens] of Object.entries(NOT_A_REPOSITORY_FILE)) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const token of tokens) {
        if (!text.includes(token)) {
          unused.push(`${file} no longer names ${token} - drop it from the list`);
        }
      }
    }

    assert.deepEqual(unused, []);
  });
});
