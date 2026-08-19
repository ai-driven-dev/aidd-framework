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

const SRC = path.join(process.cwd(), "cli", "src");

const IMPORT_PATTERN = /(?:from|import)\s+["']([^"']+)["']/g;
const WIDENING_CAST = /\bas\s+unknown\s+as\b/;

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

/** Two pre-existing casts, in code unrelated to the rule's introduction. Listed so the
 * debt is visible and shrinking rather than silently permitted everywhere. */
const CASTS_ALLOWED = new Set([
  "application/use-cases/framework/framework-build-use-case.ts",
  "application/use-cases/framework/strategies/marketplace-build-strategy.ts",
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

function castBreach(relativePath, source) {
  if (!WIDENING_CAST.test(source) || CASTS_ALLOWED.has(relativePath)) return null;
  return `${relativePath} widens a type through \`as unknown as\` - build the value with the type it claims`;
}

const breaches = [];
for (const file of await typescriptFilesUnder(SRC)) {
  const relativePath = path.relative(SRC, file);
  const source = await readFile(file, "utf-8");
  for (const breach of [layeringBreach(relativePath, source), castBreach(relativePath, source)]) {
    if (breach) breaches.push(`  ${breach}`);
  }
}

if (breaches.length > 0) {
  console.error(`cli layering breaches:\n${breaches.join("\n")}`);
  console.error("Contract: cli/.claude/rules/00-architecture/0-hexagonal.md");
  process.exit(1);
}

console.log("Dependencies point inward, and no type is widened through unknown.");
