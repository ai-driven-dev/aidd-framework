#!/usr/bin/env node
// Enforces the one invariant of cli/.claude/rules/00-architecture/0-hexagonal.md that a
// linter cannot express: the type system is not bypassed by widening a value away from the
// type it claims to hold.
//
// Dependency direction (domain never imports application/infrastructure, and so on) is
// biome's own job now: `cli/biome.json`'s per-layer `noRestrictedImports` overrides match
// the resolved path, not a hand-picked prefix, and are exercised by
// `cli/tests/architecture/import-rules-bite.arch.test.ts`. A script duplicating that check
// against `domain/`, `application/` and `infrastructure/` directly under `src/` stayed green
// after the context refactor moved every one of those under `src/contexts/<context>/`,
// because it never matched anything there to begin with.
//
// Usage:
//   node scripts/check-cli-type-honesty.mjs   # exit 1 on any breach

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CLI = path.join(process.cwd(), "cli");
const SRC = path.join(CLI, "src");
const TESTS = path.join(CLI, "tests");

/**
 * `as unknown as T` walks up to `unknown` and back down; `as never` walks down to the
 * bottom type, assignable to everything; `as any` opts a value out of checking entirely.
 * `\bas` is what keeps prose out - "was never" has no word boundary before its "as". `any`
 * needs a second guard the other two do not: it is also an English word, and a comment
 * reading "the same as any other day file" or "as any two ... would be" matched the cast
 * syntax until the negative lookahead was added. A real cast's `any` is a complete type, so
 * whatever follows it is punctuation or whitespace-then-punctuation, never another word -
 * exactly what distinguishes it from "as any <word>" prose.
 */
const WIDENING_ANYWHERE = [
  /\bas\s+unknown\s+as\b/,
  /\bas\s+never\b/,
  /\bas\s+any\b(?!\s*[a-zA-Z])/,
];

/**
 * `@ts-expect-error` and `@ts-ignore` silence the compiler instead of building a value the
 * type accepts - but a test whose whole point is that something does not compile has no
 * other way to assert that, and three do: `installed-plugin.unit.test.ts`,
 * `person-resolution.unit.test.ts` and `read-local-cost-use-case.unit.test.ts` each suppress
 * a directive-carrying line to prove a shape is rejected, with the rejected shape named in
 * the comment beside it. That is a compiler assertion, not a widened value, and it exists
 * only in `tests/` - production code has no "prove this doesn't compile" to make. So these
 * two directives are checked in `src/` only; `as unknown as`, `as never` and `as any` remain
 * checked in both, because a production value built by any of them is exactly the bug this
 * script exists to catch, and a test can widen one too.
 */
const WIDENING_SRC_ONLY = [/@ts-expect-error\b/, /@ts-ignore\b/];

/** Every cast the type system cannot express away, each with the reason it survives.
 * Paths are cli-relative. Listed so the debt is visible and shrinking rather than
 * silently permitted everywhere - adding a line here is a decision, not a default. */
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
