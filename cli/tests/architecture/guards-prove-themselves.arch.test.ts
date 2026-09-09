/**
 * A guard nothing fails for is a comment. Every ratchet here carries its probes under one
 * `describe("the guard itself")`, and every check script at the repository root has a test
 * that plants the defect it names; a new guard without either is refused by name.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, REPO_ROOT, read } from "./helpers.js";

const PROBE_BLOCK = /describe\(\s*"the guard itself"\s*,/;
const PROBE_CASE = /\bit\(\s*["'`]/;

/** What is missing from a guard's own file: the probe block, or a case inside it. */
function unprovenGuard(source: string): string | null {
  const block = PROBE_BLOCK.exec(source);
  if (block === null) return 'no describe("the guard itself") block';
  if (!PROBE_CASE.test(source.slice(block.index))) return "a probe block with no case in it";
  return null;
}

/** The test a root check script is proven by: its stem with or without the `check-` prefix. */
function testNamesFor(script: string): string[] {
  const stem = script.replace(/\.(m?js)$/, "");
  return [`${stem}.test.js`, `${stem.replace(/^check-/, "")}.test.js`];
}

function untestedScript(script: string, tests: ReadonlySet<string>): boolean {
  return !testNamesFor(script).some((name) => tests.has(name));
}

describe("guards prove themselves", () => {
  it("every architecture ratchet carries a probe block with at least one case", () => {
    const dir = join(CLI_ROOT, "tests", "architecture");
    const unproven = readdirSync(dir)
      .filter((entry) => entry.endsWith(".arch.test.ts"))
      .map((entry) => ({ entry, missing: unprovenGuard(read(`tests/architecture/${entry}`)) }))
      .filter(({ missing }) => missing !== null)
      .map(({ entry, missing }) => `${entry}: ${missing}`);

    expect(unproven, "plant the defect the guard names and watch it go red").toEqual([]);
  });

  it("every check script at the repository root has a test named for it", () => {
    const scripts = readdirSync(join(REPO_ROOT, "scripts")).filter((entry) =>
      /^(check|validate)-.*\.m?js$/.test(entry)
    );
    const tests = new Set(readdirSync(join(REPO_ROOT, "scripts", "__tests__")));
    const untested = scripts.filter((script) => untestedScript(script, tests));

    expect(untested, "add scripts/__tests__/<stem>.test.js spawning it on a planted tree").toEqual(
      []
    );
    expect(existsSync(join(REPO_ROOT, "scripts", "__tests__")), "the test directory moved").toBe(
      true
    );
  });
});

describe("the guard itself", () => {
  it("names a file with no probe block, one whose block holds no case, and clears a proven one", () => {
    expect(unprovenGuard('describe("x", () => { it("y", () => {}); });')).toBe(
      'no describe("the guard itself") block'
    );
    expect(unprovenGuard('describe("the guard itself", () => {});')).toBe(
      "a probe block with no case in it"
    );
    expect(
      unprovenGuard('describe("the guard itself", () => { it("flags it", () => {}); });')
    ).toBe(null);
  });

  it("accepts a test named with or without the check- prefix, and refuses one named for nothing", () => {
    const tests = new Set(["markdown-links.test.js", "check-json.test.js"]);
    expect(untestedScript("check-markdown-links.js", tests)).toBe(false);
    expect(untestedScript("check-json.mjs", tests)).toBe(false);
    expect(untestedScript("check-nothing.js", tests)).toBe(true);
  });
});
