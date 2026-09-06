#!/usr/bin/env node
// Validates YAML syntax using the repository's Node dependency, avoiding Python in hooks.

import { readFile } from "node:fs/promises";
import { loadAll } from "js-yaml";

const files = process.argv.slice(2).filter((file) => file !== "--");
const errors = [];

for (const file of files) {
  try {
    // `loadAll`, not `load`: a YAML stream may hold several documents, and `load`
    // rejects one that does with "expected a single document in the stream". pnpm 12
    // writes exactly that shape - a lockfile whose first document carries
    // `packageManagerDependencies` and whose second carries the lockfile itself - so
    // `load` reported three valid files as broken. What this checks is syntax; how
    // many documents a file holds is not a syntax error.
    loadAll(await readFile(file, "utf8"), null, { filename: file });
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `❌ ${error}`).join("\n"));
  process.exit(1);
}

console.log(`YAML validation passed for ${files.length} file(s).`);
