/**
 * A comment exists only when it says something the code cannot, and never names a ticket,
 * a commit, a date or a URL: the fact belongs in the comment, where it was decided in git
 * and `aidd_docs/`. The volume of comments under `src/` and `tests/` may only shrink.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, read, sourceFiles } from "./helpers.js";

const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;
const DIRECTIVE = /biome-ignore|@ts-expect-error|eslint-disable/;

/** What a comment may not carry: an issue or PR number, a date, a commit hash, a link. */
const EXTERNAL_REFERENCE: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "issue or pull request number", pattern: /(^|[^\w&])#\d{2,}\b/ },
  { name: "date", pattern: /\b20\d\d-\d\d-\d\d\b/ },
  { name: "commit hash", pattern: /\b[0-9a-f]{7,40}\b/ },
  { name: "url", pattern: /https?:\/\// },
  { name: "pull request", pattern: /\bpull request\b|\bPR\s*#?\d/i },
];

/** Comment lines under `src/` and `tests/` may only decrease; a raise needs its reason here: tests/ 2960 to 2984, four guard files and their probes; 2984 to 2987, the reason the display folder is baselined over the size limit. */
const MAX_COMMENT_LINES = { src: 4474, tests: 2987 };

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "fixtures" || entry === "snapshots") continue;
        walk(full);
      } else if (entry.endsWith(".ts")) out.push(relative(CLI_ROOT, full));
    }
  };
  walk(join(CLI_ROOT, "tests"));
  return out.sort();
}

function commentLinesIn(source: string): { line: number; text: string }[] {
  return source
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => COMMENT_LINE.test(text) && !DIRECTIVE.test(text));
}

function commentLines(file: string): { line: number; text: string }[] {
  return commentLinesIn(read(file));
}

function externalReferenceIn(text: string): string | null {
  return EXTERNAL_REFERENCE.find(({ pattern }) => pattern.test(text))?.name ?? null;
}

describe("comments", () => {
  it("name no ticket, commit, date or link — the fact stays, where it was decided goes", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(), ...testFiles()]) {
      for (const { line, text } of commentLines(file)) {
        const hit = externalReferenceIn(text);
        if (hit) offenders.push(`${file}:${line} (${hit}): ${text.trim()}`);
      }
    }
    expect(offenders, "comments carrying an external reference").toEqual([]);
  });

  it("do not grow: the comment volume under src/ and tests/ only ratchets down", () => {
    const count = (files: string[]) =>
      files.reduce((total, file) => total + commentLines(file).length, 0);
    const src = count(sourceFiles());
    const tests = count(testFiles());
    expect(src, `comment lines under src/ (baseline ${MAX_COMMENT_LINES.src})`).toBeLessThanOrEqual(
      MAX_COMMENT_LINES.src
    );
    expect(
      tests,
      `comment lines under tests/ (baseline ${MAX_COMMENT_LINES.tests})`
    ).toBeLessThanOrEqual(MAX_COMMENT_LINES.tests);
  });
});

describe("the guard itself", () => {
  it("names the kind of reference a comment carries, and stays silent on one carrying none", () => {
    expect(externalReferenceIn("  // closes #4242")).toBe("issue or pull request number");
    expect(externalReferenceIn("  // measured on 2024-01-31")).toBe("date");
    expect(externalReferenceIn("  // see https://example.test/x")).toBe("url");
    expect(externalReferenceIn("  // the constraint, and what it costs")).toBeNull();
  });

  it("counts a comment line, skips code, and skips a line whose only job is a directive", () => {
    const source = [
      "  // a note",
      "  /* a block opens",
      "   * and continues",
      "  const x = 1;",
      "  // biome-ignore lint/style/noVar: reason",
    ].join("\n");

    expect(commentLinesIn(source).map(({ line }) => line)).toEqual([1, 2, 3]);
  });
});
