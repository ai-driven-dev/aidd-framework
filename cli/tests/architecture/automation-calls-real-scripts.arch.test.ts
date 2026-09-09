/**
 * CI and the git hooks live outside this package, so a script renamed here goes on being
 * called there while every local check passes. Only calls that run against this package
 * count: a `cd cli && pnpm x` line, or a call in a `run:` block that `cd`s here first —
 * `cd` on one line still governs a `pnpm` call two lines later, in the same shell.
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

/** Leading spaces only: YAML forbids a tab for indentation. */
function indentOf(line: string): number {
  return /^(\s*)/.exec(line)?.[1]?.length ?? 0;
}

/**
 * A `run: value` is a body of one line; `run: |` opens a block scalar whose body is every
 * line indented further than the `run:` key, ending at the first line back at or above that
 * indentation rather than at the next blank line.
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
 * Tracked line by line the way the shell runs the block: a `cd` governs every later `pnpm`
 * call in the same body, and the state does not survive into the next `run:`, which is its
 * own shell process.
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

function undeclaredScriptCalls(text: string, declared: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const body of runBodies(text)) {
    for (const script of pnpmCallsAgainst("cli", body)) {
      if (!PNPM_BUILTINS.has(script) && !declared.has(script)) missing.push(script);
    }
  }
  return missing;
}

function foreignIncludes(tsconfig: string): string[] {
  const config = JSON.parse(tsconfig.replace(/\/\/[^\n]*/g, "")) as { include?: string[] };
  return (config.include ?? []).filter((pattern) => pattern.startsWith("../"));
}

describe("this package's program stops at this package", () => {
  it("compiles nothing outside cli/, so a CI job needs no sibling's dependencies", () => {
    expect(
      foreignIncludes(readFileSync(join(CLI_ROOT, "tsconfig.json"), "utf8")),
      "tsconfig reaches outside the package — every job running tsc must then install that sibling's dependencies, and dropping one breaks CI while every local check stays green"
    ).toEqual([]);
  });
});

describe("the automation calls scripts this package still has", () => {
  it("every pnpm script CI and the hooks run against cli/ exists in its manifest", () => {
    const scripts = manifestScripts();
    const missing = automationFiles()
      .flatMap((file) =>
        undeclaredScriptCalls(readFileSync(file, "utf8"), scripts).map(
          (script) => `${file.replace(`${REPO_ROOT}/`, "")}: pnpm ${script}`
        )
      )
      .sort();

    expect(missing, "an automation file runs a script cli/package.json no longer declares").toEqual(
      []
    );
  });

  it("finds a call in a workflow and ignores pnpm's own verbs", () => {
    const found = undeclaredScriptCalls(
      readFileSync(join(WORKFLOWS, "cli-ci.yml"), "utf8"),
      new Set()
    );

    expect(found, "the real workflow calls this package's scripts").toContain("knip");
    expect(found, "`pnpm install` is not a script").not.toContain("install");
  });
});

describe("the guard itself", () => {
  it("names a script the manifest lost and stays silent on one it still declares", () => {
    const workflow = ["      - run: |", "          cd cli", "          pnpm gone", ""].join("\n");

    expect(undeclaredScriptCalls(workflow, new Set(["knip"]))).toEqual(["gone"]);
    expect(undeclaredScriptCalls(workflow, new Set(["gone"]))).toEqual([]);
  });

  it("reads an include reaching outside the package, and clears one that stays inside", () => {
    expect(foreignIncludes('{ "include": ["../kanban/src/**/*.ts"] }')).toEqual([
      "../kanban/src/**/*.ts",
    ]);
    expect(foreignIncludes('{ "include": ["src/**/*.ts"] } // a trailing note')).toEqual([]);
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
