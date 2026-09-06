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
 * a `run:` block whose earlier line `cd`s here first. A single-line regex only ever saw the
 * first form: the windows job's own `run: |` block does `cd cli` on one line and `pnpm
 * build` two lines later, in the same shell script, and that call was invisible until this
 * rule followed `cd` line by line instead. pnpm's own verbs are not scripts and are
 * excluded.
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

/** The indentation of a line — how many leading spaces it carries, tabs aside since YAML
 * forbids them for indentation. */
function indentOf(line: string): number {
  return /^(\s*)/.exec(line)?.[1]?.length ?? 0;
}

/**
 * Every `run:` step's body, as its own array of lines.
 *
 * A `run: value` on one line is a body of one line; `run: |` (or `|-`, `>`) opens a block
 * scalar whose body is every following line indented further than the `run:` key itself,
 * which is how YAML itself delimits it — the block ends at the first line back at or above
 * that indentation, not at the next blank line.
 */
function runBodies(text: string): string[][] {
  const lines = text.split("\n");
  const bodies: string[][] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const match = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (!match) {
      i++;
      continue;
    }
    const keyIndent = indentOf(line);
    const rest = (match[2] as string).trim();
    if (/^[|>][+-]?$/.test(rest)) {
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const bodyLine = lines[i] as string;
        if (bodyLine.trim() !== "" && indentOf(bodyLine) <= keyIndent) break;
        body.push(bodyLine);
        i++;
      }
      bodies.push(body);
    } else {
      bodies.push([rest]);
      i++;
    }
  }
  return bodies;
}

/**
 * Every `pnpm <script>` a `run:` body calls while its own `cd` state points at `dir` —
 * tracked line by line, the same way the shell itself would run the block: `cd cli` on one
 * line changes where every later `pnpm` call in that same body lands, `cd` to anything else
 * changes it away, and the state does not survive into the next `run:` body — each step's
 * `run:` is its own shell process, so nothing here needs to model a step boundary as
 * anything other than a fresh body.
 */
function pnpmCallsAgainst(dir: string, body: readonly string[]): string[] {
  let cwd: string | null = null;
  const calls: string[] = [];
  for (const rawLine of body) {
    for (const segment of rawLine.split("&&")) {
      const trimmed = segment.trim();
      const cd = /^cd\s+(\S+)/.exec(trimmed);
      if (cd) {
        cwd = cd[1] as string;
        continue;
      }
      const pnpm = /^pnpm\s+([a-z][\w:.-]*)/.exec(trimmed);
      if (pnpm && cwd === dir) calls.push(pnpm[1] as string);
    }
  }
  return calls;
}

/** Every `pnpm <script>` an automation file runs against this package, with where it runs. */
function scriptCalls(files: readonly string[]): { file: string; script: string }[] {
  const calls: { file: string; script: string }[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const body of runBodies(text)) {
      for (const script of pnpmCallsAgainst("cli", body)) {
        if (!PNPM_BUILTINS.has(script)) calls.push({ file, script });
      }
    }
  }
  return calls;
}

/** Directories outside this package that its own TypeScript program still compiles. */
function foreignIncludes(): string[] {
  const raw = readFileSync(join(CLI_ROOT, "tsconfig.json"), "utf8").replace(/\/\/[^\n]*/g, "");
  const config = JSON.parse(raw) as { include?: string[] };
  return (config.include ?? []).filter((pattern) => pattern.startsWith("../"));
}

describe("this package's program stops at this package", () => {
  it("compiles nothing outside cli/, so a CI job needs no sibling's dependencies", () => {
    expect(
      foreignIncludes(),
      "tsconfig reaches outside the package — every job running tsc must then install that sibling's dependencies, and dropping one breaks CI while every local check stays green"
    ).toEqual([]);
  });
});

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

  it("follows cd line by line inside a run: | block, past where the old regex stopped seeing", () => {
    const block = [
      "        run: |",
      "          cd cli",
      "          pnpm build",
      "          pnpm pack --pack-destination ./dist",
      "          npm install -g ./dist/ai-driven-dev-cli-*.tgz --force",
    ].join("\n");

    expect(runBodies(block)).toEqual([
      [
        "          cd cli",
        "          pnpm build",
        "          pnpm pack --pack-destination ./dist",
        "          npm install -g ./dist/ai-driven-dev-cli-*.tgz --force",
      ],
    ]);
    // A single-line regex (`cd cli && pnpm x`) never matches any line of this block —
    // `pnpm build` alone is what it missed.
    expect(pnpmCallsAgainst("cli", runBodies(block)[0] as string[])).toContain("build");
  });

  it("does not let cd cross into a later, unrelated run: body", () => {
    const twoSteps = [
      "      - run: |",
      "          cd kanban",
      "      - run: |",
      "          pnpm bogus-script",
    ].join("\n");

    for (const body of runBodies(twoSteps)) {
      expect(pnpmCallsAgainst("cli", body)).toEqual([]);
    }
  });
});
