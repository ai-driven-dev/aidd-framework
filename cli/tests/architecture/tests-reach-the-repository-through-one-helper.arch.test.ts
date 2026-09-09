/**
 * A test that climbs above cli/ by counting `../` or by `process.cwd()` reads the wrong tree
 * the day the package is copied, which a mutation run does. `tests/helpers/repository-root.ts`
 * is the one place that knows where the repository is.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, read } from "./helpers.js";

const HELPER = "tests/helpers/repository-root.ts";
const CLIMB = /["'`]((?:\.\.\/)+)[^"'`]*["'`]/g;
const CWD_PARENT = /process\.cwd\(\)\s*,\s*["']\.\.["']/g;
const PACKAGE_PARENT = /\b(?:resolve|join)\(\s*CLI_ROOT\s*,\s*["']\.\.["']/g;

/** What a file does to leave cli/: a literal with more `../` than its depth, a `process.cwd()`
 * joined to `..`, or the package root joined to `..`. */
function climbsAboveCli(file: string, text: string): string[] {
  const depth = file.split("/").length - 1;
  const found: string[] = [];
  for (const match of text.matchAll(CLIMB)) {
    if (match[1].length / 3 > depth) found.push(match[0]);
  }
  for (const match of text.matchAll(CWD_PARENT)) found.push(match[0]);
  for (const match of text.matchAll(PACKAGE_PARENT)) found.push(match[0]);
  return found;
}

/** The ratchets read the real checkout as text and never run against a copy, and their
 * probes plant climbing literals on purpose. */
const NEVER_COPIED = new Set(["architecture", "fixtures", "snapshots"]);

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (!NEVER_COPIED.has(entry)) walk(full);
      } else if (entry.endsWith(".ts")) out.push(relative(CLI_ROOT, full).replace(/\\/g, "/"));
    }
  };
  walk(join(CLI_ROOT, "tests"));
  return out.sort();
}

describe("tests reach the repository through one helper", () => {
  it("no test or helper climbs above cli/ on its own", () => {
    const offenders = testFiles()
      .filter((file) => file !== HELPER)
      .flatMap((file) => climbsAboveCli(file, read(file)).map((how) => `${file}: ${how}`));

    expect(offenders, `import REPOSITORY_ROOT from ${HELPER} instead`).toEqual([]);
  });
});

describe("the guard itself", () => {
  it("reports a literal climbing past the package, a cwd parent and the package root's parent, and clears a climb that stays inside", () => {
    const file = "tests/contexts/a/b.unit.test.ts";
    expect(
      climbsAboveCli(
        file,
        [
          'import { x } from "../../../src/x.js";',
          'readFileSync(new URL("../../../../plugins/p/README.md", import.meta.url));',
          'resolve(process.cwd(), "..", "plugins");',
          'join(CLI_ROOT, "..")',
          'join(dir, "..")',
        ].join("\n")
      )
    ).toEqual(['"../../../../plugins/p/README.md"', 'process.cwd(), ".."', 'join(CLI_ROOT, ".."']);
  });
});
