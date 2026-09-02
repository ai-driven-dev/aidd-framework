/**
 * An error that tells the user what to run must name a command that exists.
 *
 * Mutation testing put the question on the table: a hundred of the kernel's surviving
 * mutants replaced an error message with an empty string, and no test noticed. The
 * conclusion is not that every message needs pinning — asserting prose gives tests that
 * break on a reword and protect nothing. It is that the messages divide in two.
 *
 * A message that *describes* what happened is prose. A message that *instructs* — "Run
 * `aidd marketplace add`" — is a contract with the user, and the cost of it being wrong
 * is a person typing a command that does not exist. One already did: an error still sent
 * people to `aidd plugin marketplace add` after that spelling was retired.
 *
 * So this checks the instructing half only, and it checks the one property prose cannot
 * carry: that the command is real.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, read, sourceFiles } from "./helpers.js";

/** `aidd <verb>` or `aidd <noun> <verb>` as it appears inside a message. */
const INSTRUCTED_COMMAND = /\baidd ([a-z][a-z-]*)(?: ([a-z][a-z-]*))?/g;

/**
 * Every invocation the CLI declares: a top-level verb, and each `noun verb` pair.
 *
 * The pair matters. A message naming `aidd plugin marketplace add` passes any check that
 * only looks at the first word, because `plugin` exists — while `marketplace` is not one
 * of its subcommands, which is precisely how that message shipped wrong.
 */
function declaredCommands(): Set<string> {
  const declared = new Set<string>();
  for (const file of sourceFiles().filter((f) => f.startsWith("src/presentation/commands/"))) {
    const source = read(file);
    // `const x = program.command("noun")` names a parent; every other `.command("verb")`
    // in that file is one of its subcommands.
    const parent = /program\s*\n?\s*\.?command\("([a-z][a-z-]*)"/.exec(source)?.[1];
    for (const match of source.matchAll(/\.command\("([a-z][a-z-]*)/g)) {
      declared.add(match[1]);
      if (parent !== undefined && match[1] !== parent) declared.add(`${parent} ${match[1]}`);
    }
  }
  if (declared.size === 0) throw new Error("no command found — the scope of this rule is stale");
  return declared;
}

/** A word that reads as an argument rather than a subcommand. */
function isArgumentLike(word: string): boolean {
  return word.startsWith("<") || word.startsWith("[");
}

/** Commands an error instructs the reader to run, that the CLI does not declare. */
function unrunnableInstructions(text: string, declared: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const match of text.matchAll(INSTRUCTED_COMMAND)) {
    const [, first, second] = match;
    // A bare verb needs only itself declared; `aidd setup --ai` reads as a bare verb
    // because a flag is not a word this pattern captures. A pair needs the pair.
    if (second === undefined) {
      if (!declared.has(first)) missing.push(first);
      continue;
    }
    if (declared.has(`${first} ${second}`)) continue;
    // A declared verb followed by something else is that verb plus an argument, not a
    // subcommand: `aidd marketplace add` is a pair, `aidd update --force` is not.
    if (declared.has(first) && !declared.has(`${first} ${second}`) && isArgumentLike(second)) {
      continue;
    }
    missing.push(`${first} ${second}`);
  }
  return missing;
}

describe("an error that instructs names a command that exists", () => {
  it("every command an error tells the user to run is declared", () => {
    const declared = declaredCommands();
    const offenders: string[] = [];
    for (const file of sourceFiles().filter((f) => f.endsWith("errors.ts"))) {
      for (const command of unrunnableInstructions(
        readFileSync(join(CLI_ROOT, file), "utf8"),
        declared
      )) {
        offenders.push(`${file}: aidd ${command}`);
      }
    }
    expect(offenders, "an error sends the user at a command the CLI does not declare").toEqual([]);
  });

  it("flags an instruction the CLI cannot honour, and passes one it can", () => {
    const declared = new Set(["marketplace", "marketplace add", "plugin", "setup"]);
    expect(unrunnableInstructions("Use `aidd marketplace add <x>` first.", declared)).toEqual([]);
    expect(unrunnableInstructions("Run `aidd setup` again.", declared)).toEqual([]);
    // `plugin` exists; `plugin marketplace` does not. Checking only the first word
    // would clear this, and that is the invocation that actually shipped wrong.
    expect(unrunnableInstructions("Run `aidd plugin marketplace add`.", declared)).toEqual([
      "plugin marketplace",
    ]);
  });
});
