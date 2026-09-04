#!/usr/bin/env node
// Enforces the two invariants of cli/.claude/rules/00-architecture/0-hexagonal.md that a
// linter cannot express: dependencies point inward, and the type system is not bypassed.
//
// Biome cannot do the first: its noRestrictedImports matches exact module specifiers, not
// path prefixes, so a rule written against "../../infrastructure" never fires. Measured,
// not assumed - a deliberate violation planted in src/domain went unreported.
//
// Usage:
//   node scripts/check-cli-layering.mjs   # exit 1 on any breach

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CLI = path.join(process.cwd(), "cli");
const SRC = path.join(CLI, "src");
const TESTS = path.join(CLI, "tests");

/** The cast rule holds everywhere; the layering rule is about production layers only.
 * A test lives outside them and legitimately wires an adapter to a use-case. */
const CAST_ROOTS = [SRC, TESTS];
const LAYERING_ROOTS = [SRC];

const IMPORT_PATTERN = /(?:from|import)\s+["']([^"']+)["']/g;

/** Both spellings of the same lie: `as unknown as T` walks up to `unknown` and back down,
 * `as never` walks down to the bottom type, which is assignable to everything. `\bas` is
 * what keeps prose out - "was never" has no word boundary before its "as". */
const WIDENING_CASTS = [/\bas\s+unknown\s+as\b/, /\bas\s+never\b/];

function widensAType(source) {
  return WIDENING_CASTS.some((pattern) => pattern.test(source));
}

/** Layers may only reach inward. `application/commands/` is the composition root's caller:
 * it exists to hand `createDeps` to a use-case, which is the one place the wiring happens. */
const INWARD_ONLY = [
  {
    layer: "domain",
    forbids: ["application", "infrastructure"],
    reason: "the domain is the innermost layer and depends on nothing",
  },
  {
    layer: "application",
    forbids: ["infrastructure"],
    exempt: ["application/commands"],
    reason: "use-cases depend on ports, never on the adapters that implement them",
  },
];

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

function importedLayers(source) {
  const layers = new Set();
  for (const [, specifier] of source.matchAll(IMPORT_PATTERN)) {
    const match = /(?:^|\/)(domain|application|infrastructure)\//.exec(specifier);
    if (match) layers.add(match[1]);
  }
  return layers;
}

function layeringBreach(relativePath, source) {
  for (const { layer, forbids, exempt, reason } of INWARD_ONLY) {
    if (!relativePath.startsWith(`${layer}/`)) continue;
    if (exempt?.some((prefix) => relativePath.startsWith(`${prefix}/`))) continue;
    const reached = [...importedLayers(source)].filter((imported) => forbids.includes(imported));
    if (reached.length > 0) {
      return `${relativePath} imports ${reached.join(", ")} - ${reason}`;
    }
  }
  return null;
}

function castBreach(cliPath, source) {
  if (!widensAType(source) || CASTS_ALLOWED.has(cliPath)) return null;
  return `cli/${cliPath} widens a type through \`as unknown as\` or \`as never\` - build the value with the type it claims`;
}

const breaches = [];
const spentAllowances = new Set();

for (const root of CAST_ROOTS) {
  for (const file of await typescriptFilesUnder(root)) {
    const cliPath = relative(CLI, file);
    const source = await readFile(file, "utf-8");
    if (widensAType(source)) spentAllowances.add(cliPath);
    const breach = castBreach(cliPath, source);
    if (breach) breaches.push(`  ${breach}`);
  }
}

for (const root of LAYERING_ROOTS) {
  for (const file of await typescriptFilesUnder(root)) {
    const breach = layeringBreach(relative(root, file), await readFile(file, "utf-8"));
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
  console.error(`cli layering breaches:\n${breaches.join("\n")}`);
  console.error("Contract: cli/.claude/rules/00-architecture/0-hexagonal.md");
  process.exit(1);
}

console.log("Dependencies point inward, and no type is widened through unknown or never.");
