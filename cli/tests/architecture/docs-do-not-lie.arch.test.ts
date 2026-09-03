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

/**
 * Documents that present the CLI's surface to a reader.
 *
 * The memory bank was outside this scope for one phase and it is the document an agent reads
 * first, in every session. `GUIDELINES.md` names the commands a contributor runs.
 */
const DOCS = [
  "ARCHITECTURE.md",
  "README.md",
  "aidd_docs/memory/codebase-map.md",
  "aidd_docs/memory/project-brief.md",
  "aidd_docs/GUIDELINES.md",
];

/** The line itself says the command is gone. */
const MARKED_GONE = /\b(removed|legacy|no longer|deprecated|replaced by)\b|there is no/i;

/** A table row naming two commands maps an old one to its replacement. */
function isMigrationRow(line: string): boolean {
  return line.trimStart().startsWith("|") && [...line.matchAll(/\baidd\s+[a-z]/g)].length >= 2;
}

function registeredCommands(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles().filter((f) => f.startsWith("src/presentation/commands/"))) {
    for (const match of read(file).matchAll(/\.command\("([a-z][a-z-]*)/g)) names.add(match[1]);
  }
  // An empty set would clear every document at once: nothing can be undeclared when
  // nothing is declared. A sibling rule failed exactly that way when its directory
  // moved, so the emptiness is checked rather than assumed.
  if (names.size === 0) throw new Error("no command found — the scope of this rule is stale");
  return names;
}

/** The rule's citation-gathering half, over raw text instead of a file on disk. */
function citedAsAvailableInText(text: string): string[] {
  const cited = new Set<string>();
  for (const line of text.split("\n")) {
    if (MARKED_GONE.test(line) || isMigrationRow(line)) continue;
    for (const match of line.matchAll(/\baidd\s+([a-z][a-z-]*)/g)) cited.add(match[1]);
  }
  return [...cited].sort();
}

/** The rule itself: which cited commands the registered set does not declare. */
function undeclaredCommands(text: string, registered: ReadonlySet<string>): string[] {
  return citedAsAvailableInText(text).filter((name) => !registered.has(name));
}

describe("documented commands exist", () => {
  const registered = registeredCommands();

  it.each(DOCS)("%s presents no command the CLI does not declare", (doc) => {
    const missing = undeclaredCommands(read(doc), registered);
    expect(missing, `${doc} presents commands that do not exist`).toEqual([]);
  });

  it("flags an undeclared command and clears one marked gone, migrated, or registered", () => {
    const knownCommands = new Set(["init"]);

    expect(undeclaredCommands("Run `aidd bogus-command` to do it.", knownCommands)).toEqual([
      "bogus-command",
    ]);
    expect(undeclaredCommands("`aidd bogus-command` was removed.", knownCommands)).toEqual([]);
    expect(undeclaredCommands("| `aidd old-name` | `aidd new-name` |", knownCommands)).toEqual([]);
    expect(undeclaredCommands("Run `aidd init` to start.", knownCommands)).toEqual([]);
  });
});
