#!/usr/bin/env node
// Enforces the one invariant of cli/.claude/rules/00-architecture/0-hexagonal.md that a
// linter cannot express: no value is widened away from the type it claims to hold.
// Dependency direction belongs to biome, whose per-layer `noRestrictedImports` overrides
// match the resolved path — a hand-picked prefix here goes stale the moment a layer moves.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CLI = path.join(process.cwd(), "cli");
const SRC = path.join(CLI, "src");
const TESTS = path.join(CLI, "tests");

/**
 * `\bas` keeps prose out - "was never" has no word boundary before its "as". `any` needs the
 * negative lookahead on top: it is also an English word, and a real cast's `any` is a
 * complete type, so what follows it is punctuation, never another word.
 */
const WIDENING_ANYWHERE = [
  /\bas\s+unknown\s+as\b/,
  /\bas\s+never\b/,
  /\bas\s+any\b(?!\s*[a-zA-Z])/,
];

/**
 * Checked in `src/` only: a test whose whole point is that a shape does not compile has no
 * other way to assert it, and that is a compiler assertion rather than a widened value.
 * Production code has no "prove this doesn't compile" to make.
 */
const WIDENING_SRC_ONLY = [/@ts-expect-error\b/, /@ts-ignore\b/];

/** Cli-relative paths, each with the reason the cast survives. Listed so adding one is a
 * decision rather than a default. */
const CASTS_ALLOWED = new Map([
  [
    "src/contexts/translate/application/translate-source.ts",
    "SourceMarketplace carries an index signature beside typed optional members, so no " +
      "parsed `Record<string, unknown>` can ever satisfy it; narrowing it honestly would " +
      "mean rejecting catalogs the builder accepts today",
  ],
]);

async function typescriptFilesUnder(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await typescriptFilesUnder(full)));
    else if (entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

/** Keys are written with `/` so the allow-list reads the same on every platform. */
function relative(from, file) {
  return path.relative(from, file).split(path.sep).join("/");
}

function widensAType(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

function castBreach(cliPath, source, patterns) {
  if (!widensAType(source, patterns) || CASTS_ALLOWED.has(cliPath)) return null;
  return (
    `cli/${cliPath} widens a type through \`as unknown as\`, \`as any\`, \`as never\`, ` +
    "`@ts-expect-error` or `@ts-ignore` - build the value with the type it claims"
  );
}

const breaches = [];
const spentAllowances = new Set();

for (const root of [SRC, TESTS]) {
  const patterns = root === SRC ? [...WIDENING_ANYWHERE, ...WIDENING_SRC_ONLY] : WIDENING_ANYWHERE;
  for (const file of await typescriptFilesUnder(root)) {
    const cliPath = relative(CLI, file);
    const source = await readFile(file, "utf-8");
    if (widensAType(source, patterns)) spentAllowances.add(cliPath);
    const breach = castBreach(cliPath, source, patterns);
    if (breach) breaches.push(`  ${breach}`);
  }
}

// An allowance nobody spends is stale: the cast it excused is gone, so the line goes too.
for (const cliPath of CASTS_ALLOWED.keys()) {
  if (!spentAllowances.has(cliPath)) {
    breaches.push(`  cli/${cliPath} no longer casts - drop its CASTS_ALLOWED entry`);
  }
}

if (breaches.length > 0) {
  console.error(`cli type-honesty breaches:\n${breaches.join("\n")}`);
  console.error("Contract: cli/.claude/rules/00-architecture/0-hexagonal.md");
  process.exit(1);
}

console.log("No type is widened through unknown, any or never, and no directive silences the compiler outside a test proving something does not compile.");
