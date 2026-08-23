const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { after, describe, it } = require("node:test");

const PLUGIN_DIR = path.resolve(__dirname, "../../plugins/aidd-telemetry");
const SKILLS_DIR = path.join(PLUGIN_DIR, "skills");
const HOOKS_DIR = path.join(PLUGIN_DIR, "hooks");

// A minimal PATH for spawned scripts, containing only git's own directory - never
// "/usr/bin:/bin", which doesn't hold git on Windows and uses ":" as a separator, not
// win32's ";". "where"/"which" differ by platform; either answers with the same thing,
// which is all a minimal PATH here needs (hooks/lib/repo.js shells out to git).
const GIT_DIR = path.dirname(
  execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/u)[0],
);

// Read from each script's own usage banner: `on`/`off` for the switch, `read`/`report` for
// the reporter, no argv at all for the checker. Invoking a script this way exercises its
// full require graph rather than stopping at a usage message - a stronger check than the
// generic fallback below gives an undiscovered script.
const KNOWN_INVOCATIONS = {
  "telemetry-switch.js": ["on"],
  "telemetry-identity.js": ["status"],
  "telemetry-report.js": ["read"],
  "telemetry-check.js": [],
};

const STACK_FRAME = /\n\s*at .+:\d+:\d+/u;
const tempDirs = [];

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** What the flat translation route delivers: `skills/`, and nothing beside it - no
 * `hooks/`, no repository, no plugin manifest. */
function buildFlatShape() {
  const root = makeTempDir("aidd-install-shape-flat-");
  fs.cpSync(SKILLS_DIR, path.join(root, "skills"), { recursive: true });
  return root;
}

/**
 * The native route, reconstructed rather than observed: driving
 * cli/src/domain/models/plugin-content-translator.ts from this node:test JS file turned out
 * impractical. Its constructor takes a TypeScript parameter property, which
 * `node --experimental-strip-types` refuses ("not supported in strip-only mode"), and past
 * that its relative imports use a `.js` extension that only resolves against tsup's
 * compiled output, not against the sibling `.ts` sources - so there is no build-free way to
 * import it here.
 *
 * The shape below instead follows the native layout declared for every native-mode tool
 * today - checked in cli/src/domain/tools/ai/{claude,codex,copilot,cursor}.ts, against
 * cli/src/domain/models/plugin-content-translator.ts's own `manifestDir` rule
 * (`parentDirOf(hooksRelativePath) || "hooks"`). Claude, Codex and Copilot take the default
 * `hooksRelativePath` of `hooks/hooks.json`; Cursor overrides it to `hooks.json`, whose
 * parent is `""`, which is falsy and falls back to the same `"hooks"` default. So for all
 * four, a hook script (as opposed to the manifest itself) installs under `hooks/`, a
 * sibling of `skills/` directly under the plugin root - the same relationship the plugin's
 * own source tree already has, just with `.claude/plugins/aidd-telemetry/` (or the
 * matching prefix for another tool) prepended in front of both.
 */
function buildNativeShape() {
  const root = makeTempDir("aidd-install-shape-native-");
  const pluginRoot = path.join(root, ".claude", "plugins", "aidd-telemetry");
  fs.cpSync(SKILLS_DIR, path.join(pluginRoot, "skills"), { recursive: true });
  fs.cpSync(HOOKS_DIR, path.join(pluginRoot, "hooks"), { recursive: true });
  return pluginRoot;
}

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
      if (fileEntry.isFile() && fileEntry.name.endsWith(".js")) {
        found.push(`${skillEntry.name}/scripts/${fileEntry.name}`);
      }
    }
  }
  return found.sort();
}

// A minimal, stripped environment, the same direction the neighbouring telemetry-check
// tests take: a real CLAUDE_CODE_SESSION_ID or GIT_* var this file happens to be running
// under must not leak into a script meant to be exercised in isolation.
function hermeticEnv(home) {
  const { AIDD_RUNS_DIR: _r, CLAUDE_CODE_SESSION_ID: _c, CODEX_THREAD_ID: _t, ...rest } = process.env;
  // process.env's OS-cased PATH key (often "Path" on Windows) must be filtered out too, or
  // it sits beside PATH below unfiltered, undoing the minimal PATH this function exists for.
  const withoutGit = Object.fromEntries(
    Object.entries(rest).filter(([key]) => !key.startsWith("GIT_") && !/^path$/iu.test(key)),
  );
  return { ...withoutGit, HOME: home, PATH: GIT_DIR };
}

function runScript(scriptPath, args, cwd) {
  const home = makeTempDir("aidd-install-shape-home-");
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    env: hermeticEnv(home),
  });
}

/** What a person would check: it started. A `MODULE_NOT_FOUND` or any stack trace on
 * stderr means it didn't, and a usage message on a non-zero exit still means it did. */
function assertStarted(result, label) {
  assert.equal(result.error, undefined, `${label}: could not be spawned (${result.error})`);
  assert.doesNotMatch(
    result.stderr,
    /Cannot find module|MODULE_NOT_FOUND/u,
    `${label} could not load:\n${result.stderr}`
  );
  assert.doesNotMatch(result.stderr, STACK_FRAME, `${label} crashed:\n${result.stderr}`);
  assert.ok(`${result.stdout}${result.stderr}`.trim().length > 0, `${label} printed nothing`);
}

function describeShape(name, buildShape) {
  describe(`every skill script, run from a copy shaped like ${name}`, () => {
    const skillsRoot = path.join(buildShape(), "skills");
    const scripts = discoverScripts(skillsRoot);

    it("discovers the scripts known today, so the walk itself is not silently empty", () => {
      for (const known of Object.keys(KNOWN_INVOCATIONS)) {
        assert.ok(
          scripts.some((relative) => relative.endsWith(`/${known}`)),
          `expected the walk to find ${known}`
        );
      }
    });

    for (const relativeScript of scripts) {
      const scriptPath = path.join(skillsRoot, relativeScript);
      const basename = path.basename(relativeScript);
      const args = KNOWN_INVOCATIONS[basename] ?? [];
      const invokedWithKnownArgs = basename in KNOWN_INVOCATIONS;

      it(`${relativeScript} starts and prints its own output`, () => {
        const result = runScript(scriptPath, args, path.dirname(skillsRoot));

        assertStarted(result, relativeScript);
        if (invokedWithKnownArgs) {
          assert.equal(result.status, 0, `${relativeScript} exited ${result.status}:\n${result.stderr}`);
          assert.equal(result.stderr, "", `${relativeScript} wrote to stderr:\n${result.stderr}`);
        }
      });
    }
  });
}

describeShape("what the flat translation route delivers (skills/ alone, no hooks/)", buildFlatShape);
describeShape("what a native install delivers (skills/ beside hooks/, under the plugin root)", buildNativeShape);

/**
 * Both shapes again, this time inside a host project that declares `"type": "module"`.
 *
 * Node decides a `.js` file's module system from the nearest package.json walking up, so a
 * project-scope install - `.claude/plugins/`, `.github/plugins/`, `.codex/plugins/`, all
 * inside the project - puts every script this plugin ships under the host's own declaration.
 * In an ESM project that made each one die at its first `require` with "require is not
 * defined in ES module scope", before running a single line of its own. Measured on a real
 * install, not imagined.
 *
 * `skills/package.json` declares `"type": "commonjs"` so the walk stops there. It lives
 * inside `skills/` rather than at the plugin root because that is what an install actually
 * carries - a built tree holds `hooks/`, `skills/` and the manifest, and nothing else.
 *
 * `hooks/` deliberately gets no such file. It holds one genuine ESM module,
 * `opencode-plugin.js`, and OpenCode's loader was measured refusing an `.mjs` rename - so a
 * `"type": "commonjs"` there would trade a working OpenCode for a fixed hook path. The hook
 * scripts therefore still take the host project's own declaration; a hook run under an ESM
 * project is the gap this does not close, and it is named in docs/telemetry-limits.md
 * rather than left to be discovered.
 */
function buildEsmHostShape(inner) {
  return () => {
    const host = makeTempDir("aidd-install-shape-esm-host-");
    fs.writeFileSync(
      path.join(host, "package.json"),
      `${JSON.stringify({ name: "host-project", type: "module" }, null, 2)}\n`
    );
    const pluginRoot = path.join(host, "plugin");
    fs.cpSync(inner(), pluginRoot, { recursive: true });
    return pluginRoot;
  };
}

describeShape(
  "the flat route, inside a host project that declares type: module",
  buildEsmHostShape(buildFlatShape)
);
describeShape(
  "a native install, inside a host project that declares type: module",
  buildEsmHostShape(buildNativeShape)
);
