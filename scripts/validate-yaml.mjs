#!/usr/bin/env node
// Node, not Python: a hook cannot assume a Python interpreter is installed.

import { readFile } from "node:fs/promises";
import { loadAll } from "js-yaml";

const files = process.argv.slice(2).filter((file) => file !== "--");
const errors = [];

for (const file of files) {
  try {
    // `loadAll`, not `load`: pnpm 12 writes a multi-document lockfile, and `load` rejects
    // one as "expected a single document". Document count is not a syntax error.
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
