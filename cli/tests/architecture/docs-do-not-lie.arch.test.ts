/**
 * A reader cannot tell a promised command from a declared one; this test can. Naming a command
 * in order to say it is gone is not a lie, so a citation is accepted when its line marks it
 * removed or is a migration row — which keeps the check honest without a name allowlist.
 */
import { describe, expect, it } from "vitest";
import {
  declaredCommands,
  pluginReadmes,
  read,
  readFromRepoRoot,
  unresolvedCommandMentions,
} from "./helpers.js";

/** Documents that present the CLI's surface to a reader — the memory bank included, since an
 * agent reads it first in every session. */
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

/**
 * `MARKED_GONE` is checked against a whole paragraph unwrapped to one line: markdown wraps
 * prose, so a citation and the word marking it gone can land on different physical lines. A
 * migration row is still read one line at a time, a table having no blank line to unwrap at.
 */
function textClaimingCommandsWork(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    if (MARKED_GONE.test(paragraph.replace(/\n/g, " "))) continue;
    kept.push(
      paragraph
        .split("\n")
        .filter((line) => !isMigrationRow(line))
        .join("\n")
    );
  }
  return kept.join("\n\n");
}

function undeclaredCommands(text: string, declared: ReadonlySet<string>): string[] {
  return [...new Set(unresolvedCommandMentions(textClaimingCommandsWork(text), declared))].sort();
}

describe("documented commands exist", () => {
  const declared = declaredCommands();

  it.each(DOCS)("%s presents no command the CLI does not declare", (doc) => {
    const missing = undeclaredCommands(read(doc), declared);
    expect(missing, `${doc} presents commands that do not exist`).toEqual([]);
  });

  it.each(pluginReadmes())("%s presents no command the CLI does not declare", (doc) => {
    const missing = undeclaredCommands(readFromRepoRoot(doc), declared);
    expect(missing, `${doc} presents commands that do not exist`).toEqual([]);
  });

  it("flags an undeclared command, a bad pair, and clears one marked gone, migrated, or registered", () => {
    const knownCommands = new Set(["init", "plugin", "plugin install"]);

    expect(undeclaredCommands("Run `aidd bogus-command` to do it.", knownCommands)).toEqual([
      "bogus-command",
    ]);
    // `plugin` exists; `plugin bogus` does not, and reading only the first word clears it.
    expect(undeclaredCommands("Run `aidd plugin bogus` to do it.", knownCommands)).toEqual([
      "plugin bogus",
    ]);
    expect(undeclaredCommands("`aidd bogus-command` was removed.", knownCommands)).toEqual([]);
    expect(undeclaredCommands("| `aidd old-name` | `aidd new-name` |", knownCommands)).toEqual([]);
    expect(undeclaredCommands("Run `aidd init` to start.", knownCommands)).toEqual([]);
    expect(undeclaredCommands("Run `aidd plugin install` to add one.", knownCommands)).toEqual([]);
  });
});
