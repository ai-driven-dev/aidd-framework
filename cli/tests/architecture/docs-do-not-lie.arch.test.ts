/**
 * Every command the documentation presents as available must exist.
 *
 * `ARCHITECTURE.md` announced `aidd sync` in its command surface long before any such
 * command was declared. A reader cannot tell a promise from a fact; this test can.
 *
 * Naming a command in order to say it is gone is not a lie. A citation is therefore
 * accepted when its line marks it as removed, denies its existence, or is a migration
 * table row mapping an old command to its replacement. That keeps the check honest
 * without a name allowlist going stale the day a command comes back.
 */
import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "./helpers.js";

const DOCS = ["ARCHITECTURE.md", "README.md"];

/** The line itself says the command is gone. */
const MARKED_GONE = /\b(removed|legacy|no longer|deprecated|replaced by)\b|there is no/i;

/** A table row naming two commands maps an old one to its replacement. */
function isMigrationRow(line: string): boolean {
  return line.trimStart().startsWith("|") && [...line.matchAll(/\baidd\s+[a-z]/g)].length >= 2;
}

function registeredCommands(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles().filter((f) => f.startsWith("src/application/commands/"))) {
    for (const match of read(file).matchAll(/\.command\("([a-z][a-z-]*)/g)) names.add(match[1]);
  }
  return names;
}

function citedAsAvailable(doc: string): string[] {
  const cited = new Set<string>();
  for (const line of read(doc).split("\n")) {
    if (MARKED_GONE.test(line) || isMigrationRow(line)) continue;
    for (const match of line.matchAll(/\baidd\s+([a-z][a-z-]*)/g)) cited.add(match[1]);
  }
  return [...cited].sort();
}

describe("documented commands exist", () => {
  const registered = registeredCommands();

  it.each(DOCS)("%s presents no command the CLI does not declare", (doc) => {
    const missing = citedAsAvailable(doc).filter((name) => !registered.has(name));
    expect(missing, `${doc} presents commands that do not exist`).toEqual([]);
  });
});
