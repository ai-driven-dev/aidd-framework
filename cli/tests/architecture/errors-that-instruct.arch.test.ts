/**
 * A message that *describes* is prose; one that *instructs* is a contract, and its cost when
 * wrong is a person typing a command that does not exist. Only the instructing half is
 * checked, over the surface a person reads: `presentation/` and each `application/` layer.
 */
import { describe, expect, it } from "vitest";
import {
  declaredCommands,
  expectRatchet,
  read,
  sourceFiles,
  unresolvedCommandMentions,
} from "./helpers.js";

/**
 * A crude regex, not a parser: it cannot tell a comment from code, so a backticked example in
 * a doc comment is scanned like a printed message. What the quote requirement buys is dropping
 * unquoted prose ("the aidd config directory"), which never claimed to be runnable.
 */
function stringLiterals(source: string): string[] {
  const literals: string[] = [];
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g)) {
    literals.push(match[0].slice(1, -1));
  }
  return literals;
}

/** A use case, or a file that speaks to the user directly under `presentation/`. */
function instructsAUser(file: string): boolean {
  return file.startsWith("src/presentation/") || /\/application\//.test(file);
}

/** Empty, and staying so: a message naming a command the CLI does not declare is a message to
 * fix, not one to record here. */
const BASELINE: string[] = [];

describe("a message that instructs names a command that exists", () => {
  it("every command a message tells the user to run is declared", () => {
    const declared = declaredCommands();
    const offenders: string[] = [];
    for (const file of sourceFiles().filter(instructsAUser)) {
      for (const literal of stringLiterals(read(file))) {
        for (const command of unresolvedCommandMentions(literal, declared)) {
          offenders.push(`${file}: aidd ${command}`);
        }
      }
    }

    const { added, fixed } = expectRatchet(offenders.sort(), BASELINE);
    expect(added, "a message sends the user at a command the CLI does not declare").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });
});

describe("the guard itself", () => {
  it("flags an instruction the CLI cannot honour, and passes one it can", () => {
    const declared = new Set(["marketplace", "marketplace add", "plugin", "setup"]);
    expect(unresolvedCommandMentions("Use `aidd marketplace add <x>` first.", declared)).toEqual(
      []
    );
    expect(unresolvedCommandMentions("Run `aidd setup` again.", declared)).toEqual([]);
    // `plugin` exists; `plugin marketplace` does not, and checking only the first word
    // would clear it.
    expect(unresolvedCommandMentions("Run `aidd plugin marketplace add`.", declared)).toEqual([
      "plugin marketplace",
    ]);
  });

  it("reads only quoted text, so a bare mention outside any string is not a claim", () => {
    expect(stringLiterals('const x = "aidd bogus-command";')).toEqual(["aidd bogus-command"]);
    expect(stringLiterals("the aidd config directory")).toEqual([]);
    expect(stringLiterals("// `aidd bogus-command` used to exist")).toEqual(["aidd bogus-command"]);
  });
});
