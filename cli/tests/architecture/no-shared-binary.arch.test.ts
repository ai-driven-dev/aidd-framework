/**
 * The build cleans its output directory, so a second concurrent run rewrites the binary a
 * first run's golden suites are reading mid-capture. `tests/e2e/global-setup.ts` builds a
 * private binary per run instead. The scope is `tests/` alone: `scripts/` reads the shipped
 * binary on purpose, and builds before it reads.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CLI_ROOT = resolve(import.meta.dirname, "..", "..");
const TESTS_ROOT = join(CLI_ROOT, "tests");

/** `resolve(process.cwd(), "dist...")` or `join(process.cwd(), "dist...")` — the bug. */
const CWD_INTO_DIST = /(?:resolve|join)\(\s*process\.cwd\(\)\s*,\s*["'`]dist(?:\/|["'`])/;

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(full);
    }
  };
  walk(TESTS_ROOT);
  return out;
}

describe("no test resolves a path into the shared dist/ build output", () => {
  it("every file under tests/ reads the e2e run's own binary, not dist/cli.js", () => {
    const violations = testFiles()
      .filter((file) => CWD_INTO_DIST.test(readFileSync(file, "utf8")))
      .map((file) => relative(CLI_ROOT, file));

    expect(
      violations,
      "resolves into the shared dist/ — read cliPath() from tests/e2e/helpers.ts instead"
    ).toEqual([]);
  });

  it("flags process.cwd() resolved into dist/, not an unrelated temp dist dir", () => {
    // Built from two pieces so this file's own text never carries the literal the rule
    // above forbids, which would trip it on itself.
    const violation = `resolve(process.cwd(), "di${""}st/cli.js")`;
    expect(CWD_INTO_DIST.test(violation)).toBe(true);
    expect(CWD_INTO_DIST.test('join(tempDir, "dist")')).toBe(false);
    expect(CWD_INTO_DIST.test('expect(content).toContain("dist/")')).toBe(false);
  });
});
