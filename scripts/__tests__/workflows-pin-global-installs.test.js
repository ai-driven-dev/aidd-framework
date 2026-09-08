const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");
const workflowsDir = path.join(root, ".github/workflows");

// The one way to declare a deliberate exception. A comment on the workflow line cannot
// carry it: a `run:` written as a plain scalar loses its `# …` tail to the YAML parser
// before this suite ever sees the script, so a marker there would be invisible here.
const ALLOWLIST = [
  {
    file: ".github/workflows/cli-ci.yml",
    pattern: /npm install -g @anthropic-ai\/claude-code\b/,
    reason:
      "Deliberately unpinned: the identifier-join probe exists to catch drift against " +
      "whatever claude-code currently ships, not a version this repo controls. Pinning " +
      "it would defeat the point of the probe.",
  },
];

/** Every `run:` step's script across every job in one workflow file, each tagged with
 * the file it came from — comments in the YAML never reach here, `js-yaml` already
 * dropped them, so a prose mention of `npm install -g` in a comment cannot false-positive. */
function collectRunScripts(file) {
  const doc = yaml.load(fs.readFileSync(file, "utf8"));
  const scripts = [];
  for (const job of Object.values(doc.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (typeof step.run === "string") scripts.push(step.run);
    }
  }
  return scripts;
}

/** Whether a package spec names no version at all, or names `@latest` explicitly.
 * A local tarball/path is not a registry spec — always pinned to whatever this run
 * just built — so it is never a violation regardless of what this returns. */
function isUnpinnedSpec(spec) {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.endsWith(".tgz")) return false;

  // Split off the version, respecting the leading "@" of a scoped package name:
  // "@scope/name@version" has its pin after the *second* "@", "name@version" after
  // the first, and "name" (or "@scope/name") alone has none.
  const scoped = spec.startsWith("@");
  const rest = scoped ? spec.slice(1) : spec;
  const versionSplit = rest.indexOf("@");
  const version = versionSplit === -1 ? undefined : rest.slice(versionSplit + 1);

  return version === undefined || version === "latest";
}

/** A `npm install -g`/`--global` (or `npm i`) invocation's package spec is unpinned
 * when it names no version at all, or names `@latest` explicitly — a global install
 * always hits the registry, so a bare name silently tracks whatever the registry
 * currently serves just as much as an explicit `@latest` does. `npx` normally resolves
 * a project's own dependency (or is meant to float, e.g. a one-off diagnostic) so a bare
 * `npx <pkg>` is not itself a violation — only an explicit `@latest` on an `npx` line is. */
function findUnpinnedGlobalInstalls(script) {
  const findings = [];

  const npmInstallRe = /^.*\bnpm\s+i(?:nstall)?\s+(?:-g|--global)\s+.*$/gm;
  let match;
  while ((match = npmInstallRe.exec(script)) !== null) {
    const line = match[0];
    const specMatch = line.match(/(?:-g|--global)\s+(\S+)/);
    if (specMatch === undefined || specMatch === null) continue;
    if (isUnpinnedSpec(specMatch[1])) findings.push({ line, spec: specMatch[1] });
  }

  const npxRe = /^.*\bnpx\s+.*$/gm;
  while ((match = npxRe.exec(script)) !== null) {
    const line = match[0];
    if (/\S+@latest\b/.test(line)) findings.push({ line, spec: "@latest" });
  }

  return findings;
}

test("no workflow installs a global npm package unpinned (bare or @latest)", () => {
  const files = fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));

  const violations = [];
  for (const name of files) {
    // Reported and allowlisted in POSIX form on every platform: a Windows checkout would
    // otherwise spell the same file with backslashes and match no allowlist entry.
    const relPath = path.posix.join(".github/workflows", name);
    const absPath = path.join(workflowsDir, name);
    const scripts = collectRunScripts(absPath);

    for (const script of scripts) {
      for (const finding of findUnpinnedGlobalInstalls(script)) {
        const allowed = ALLOWLIST.some(
          (entry) => entry.file === relPath && entry.pattern.test(finding.line)
        );
        if (!allowed) {
          violations.push(`${relPath}: ${finding.line.trim()}`);
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `unpinned global npm install(s) found (pin an exact version, or declare the ` +
      `exception in this suite's ALLOWLIST with its reason):\n${violations.join("\n")}`
  );
});

test("every allowlist entry still matches something (a stale entry hides a real regression)", () => {
  for (const entry of ALLOWLIST) {
    const absPath = path.join(root, entry.file);
    const scripts = collectRunScripts(absPath);
    const stillMatches = scripts.some((script) =>
      script.split("\n").some((line) => entry.pattern.test(line))
    );
    assert.ok(
      stillMatches,
      `allowlist entry for ${entry.file} (${entry.pattern}) no longer matches anything — remove it`
    );
  }
});
