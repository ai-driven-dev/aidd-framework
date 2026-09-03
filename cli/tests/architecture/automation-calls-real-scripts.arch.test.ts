/**
 * Every `pnpm <script>` the automation runs against this package exists in its manifest.
 *
 * CI and the git hooks live one directory up, outside this package, so a script renamed
 * here goes on being called there and nothing local notices: `pnpm lint`, `pnpm test` and
 * the pre-push hook all pass on a machine while the pipeline is already broken.
 *
 * That is not hypothetical. Renaming `knip:production` to `knip` updated the manifest, the
 * hook and three documents; `.github/workflows/cli-ci.yml` kept calling the old name,
 * because the sweep for stale references was run from inside this package and the workflow
 * is not inside it.
 *
 * Only calls that run against this package count — a `cd cli && pnpm x` line, or a call in
 * a job whose steps `cd` here. pnpm's own verbs are not scripts and are excluded.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT } from "./helpers.js";

const REPO_ROOT = join(CLI_ROOT, "..");
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");

/** pnpm's built-in verbs, which are never package scripts. */
const PNPM_BUILTINS = new Set([
  "install",
  "exec",
  "run",
  "dlx",
  "add",
  "remove",
  "why",
  "pack",
  "publish",
  "store",
  "workspace",
  "list",
  "outdated",
  "update",
  "config",
  "link",
  "audit",
  "-r",
  "--filter",
]);

const CALLS_THIS_PACKAGE = /cd cli && pnpm ([a-z][\w:.-]*)/g;

function manifestScripts(): Set<string> {
  const manifest = JSON.parse(readFileSync(join(CLI_ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  return new Set(Object.keys(manifest.scripts));
}

function automationFiles(): string[] {
  const files = [join(REPO_ROOT, "lefthook.yml")];
  for (const entry of readdirSync(WORKFLOWS)) {
    if (entry.endsWith(".yml") || entry.endsWith(".yaml")) files.push(join(WORKFLOWS, entry));
  }
  return files;
}

/** Every `pnpm <script>` an automation file runs against this package, with where it runs. */
function scriptCalls(files: readonly string[]): { file: string; script: string }[] {
  const calls: { file: string; script: string }[] = [];
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(CALLS_THIS_PACKAGE)) {
      const script = match[1] as string;
      if (!PNPM_BUILTINS.has(script)) calls.push({ file, script });
    }
  }
  return calls;
}

describe("the automation calls scripts this package still has", () => {
  it("every pnpm script CI and the hooks run against cli/ exists in its manifest", () => {
    const scripts = manifestScripts();
    const missing = scriptCalls(automationFiles())
      .filter((call) => !scripts.has(call.script))
      .map((call) => `${call.file.replace(`${REPO_ROOT}/`, "")}: pnpm ${call.script}`)
      .sort();

    expect(missing, "an automation file runs a script cli/package.json no longer declares").toEqual(
      []
    );
  });

  it("finds a call in a workflow and ignores pnpm's own verbs", () => {
    const sample = join(WORKFLOWS, "cli-ci.yml");
    const found = scriptCalls([sample]).map((call) => call.script);

    expect(found, "the real workflow calls this package's scripts").toContain("knip");
    expect(found, "`pnpm install` is not a script").not.toContain("install");
  });
});
