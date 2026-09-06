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
 *
 * Checking pairs, not just the first word, is what makes this test worth having: reading
 * only the first word after `aidd` cleared `aidd plugin bogus` outright, because `plugin`
 * is a real command group and `bogus` was never looked at. `declaredCommands()` and
 * `unresolvedCommandMentions()` are shared with `errors-that-instruct.arch.test.ts`, which
 * checks the same property for an error message instead of a document — one extractor, one
 * pair-aware check, used by both.
 */
import { describe, expect, it } from "vitest";
import {
  declaredCommands,
  pluginReadmes,
  read,
  readFromRepoRoot,
  unresolvedCommandMentions,
} from "./helpers.js";

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

/**
 * Strips every paragraph that talks about a command's history rather than claims it works
 * today, so the mentions that remain are exactly the ones this rule may hold to account.
 *
 * `MARKED_GONE` is checked against the whole paragraph, unwrapped to one line first:
 * markdown wraps prose at a column width, so a sentence's citation and the word that marks
 * it gone can land on different physical lines — "you ran `aidd telemetry endpoint` on an
 * older version, that is a fact ... this plugin can no longer see" wrapped exactly that way,
 * and a per-line check cleared the citation while missing "no longer" one line down. A
 * migration table row is still read one line at a time: a row is genuinely one line, and a
 * whole table has no blank line between its rows to unwrap.
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

/** Which commands a document cites as available today that the CLI does not declare. */
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
    // `plugin` exists; `plugin bogus` does not. Reading only the first word after `aidd`
    // would clear this, and that is exactly how it shipped wrong.
    expect(undeclaredCommands("Run `aidd plugin bogus` to do it.", knownCommands)).toEqual([
      "plugin bogus",
    ]);
    expect(undeclaredCommands("`aidd bogus-command` was removed.", knownCommands)).toEqual([]);
    expect(undeclaredCommands("| `aidd old-name` | `aidd new-name` |", knownCommands)).toEqual([]);
    expect(undeclaredCommands("Run `aidd init` to start.", knownCommands)).toEqual([]);
    expect(undeclaredCommands("Run `aidd plugin install` to add one.", knownCommands)).toEqual([]);
  });
});
