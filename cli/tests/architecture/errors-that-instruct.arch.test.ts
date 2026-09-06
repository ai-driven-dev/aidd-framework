/**
 * A message that tells the user what to run must name a command that exists.
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
 * carry: that the command is real. It used to scan only `*errors.ts` — every other
 * `presentation/display/` message and use-case prompt instructing a command the CLI does
 * not have was invisible to it. It now scans every string and template literal under
 * `presentation/` and every context's `application/` layer — where a use case lives, in
 * this codebase's own terms (`0-hexagonal.md`: "application/ — use cases").
 *
 * Not the whole of `src/`: a first pass over every file surfaced seven more doc-comment
 * mentions of `aidd framework build` and `aidd telemetry endpoint`, both retired commands,
 * scattered through `domain/`, `infrastructure/` and `runtime/` files that describe past
 * behaviour rather than instruct a user at a terminal — `docs/MAINTAINERS.md` already
 * records `framework build`'s removal in full. That is real drift, but it is comment
 * upkeep across files this lot does not own, not a live message sending someone at a dead
 * command — the two kinds this rule exists to tell apart. A doc comment naming a stale file
 * is `scripts/__tests__/comments-name-files-that-exist.test.js`'s job; this rule stays over
 * the surface a person actually reads.
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
 * Every quoted or template-literal span in a file's source.
 *
 * A crude regex, not a parser — it does not tell a comment from code, so a backtick-quoted
 * code example inside a doc comment is scanned exactly like a message a use case actually
 * prints. That is deliberate: this codebase's comments use backticks for inline code
 * constantly, and every one of them naming a real command passes regardless. What the
 * quote requirement buys is narrower and different — it drops unquoted prose ("the aidd
 * config directory") that never claimed to be a runnable instruction in the first place.
 */
function stringLiterals(source: string): string[] {
  const literals: string[] = [];
  for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g)) {
    literals.push(match[0].slice(1, -1));
  }
  return literals;
}

/** A use case, in this codebase's own layer terms — `0-hexagonal.md`: "application/ — use
 * cases" — or a file that speaks to the user directly under `presentation/`. */
function instructsAUser(file: string): boolean {
  return file.startsWith("src/presentation/") || /\/application\//.test(file);
}

/**
 * `telemetry-off-use-case.ts`'s own doc comment names `aidd telemetry endpoint`, a command
 * it says in the same breath was deleted — true today, but still a fact about a comment
 * this rule cannot tell from a live instruction without more than a command name to go on.
 * `init-use-case.ts` sending a reinitializing user to `aidd init --force` and
 * `setup-display.ts` printing `aidd ai status` were the other two instances found while
 * writing this rule (`init` and `ai` are not registered commands); both were corrected
 * elsewhere before this landed, which is the baseline shrinking exactly the way it should —
 * fixing the remaining line is a source change, outside this rule's own remit.
 */
const BASELINE = [
  "src/contexts/telemetry/application/telemetry-off-use-case.ts: aidd telemetry endpoint",
];

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

  it("flags an instruction the CLI cannot honour, and passes one it can", () => {
    const declared = new Set(["marketplace", "marketplace add", "plugin", "setup"]);
    expect(unresolvedCommandMentions("Use `aidd marketplace add <x>` first.", declared)).toEqual(
      []
    );
    expect(unresolvedCommandMentions("Run `aidd setup` again.", declared)).toEqual([]);
    // `plugin` exists; `plugin marketplace` does not. Checking only the first word
    // would clear this, and that is the invocation that actually shipped wrong.
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
