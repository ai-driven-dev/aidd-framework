#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Files that reshape every scope's run at once, relative to the repository root. */
export const HARNESS = [
  "cli/mutation-scopes.json",
  "cli/stryker.conf.json",
  "cli/vitest.mutation.config.ts",
  "cli/scripts/run-mutation.mjs",
  "cli/scripts/mutation-scopes-to-run.mjs",
  "cli/package.json",
  "cli/pnpm-lock.yaml",
  ".github/workflows/cli-ci.yml",
];

/** A scope runs when its source, its mirrored tests, a shared test helper or the harness
 * changed; with no usable diff, every scope runs. */
export function scopesToRun(changed, scopes, { all = false } = {}) {
  const everything =
    all || changed.some((file) => HARNESS.includes(file) || file.startsWith("cli/tests/helpers/"));
  return Object.entries(scopes)
    .filter(([, { mutate }]) => {
      const source = `cli/${mutate.slice(0, mutate.indexOf("/**"))}/`;
      const tests = source.replace("cli/src/", "cli/tests/");
      return (
        everything || changed.some((file) => file.startsWith(source) || file.startsWith(tests))
      );
    })
    .map(([name]) => name);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scopes = JSON.parse(readFileSync(join(CLI_ROOT, "mutation-scopes.json"), "utf8")).scopes;
  const changed = (process.env.CHANGED ?? "").split("\n").filter(Boolean);
  process.stdout.write(
    JSON.stringify(scopesToRun(changed, scopes, { all: process.env.ALL === "true" }))
  );
}
