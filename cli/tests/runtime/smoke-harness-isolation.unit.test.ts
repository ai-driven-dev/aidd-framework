import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const harness = readFileSync(
  fileURLToPath(new URL("../../scripts/smoke-tools.sh", import.meta.url)),
  "utf8"
);

/** The smoke harness drives the real binary across every command and every tool, and three
 * of those tools activate plugins through their own CLI - which writes into the *user's*
 * home, never the project directory. A fresh `/tmp` project isolates nothing there.
 *
 * `testing.md` has stated the rule since the work that discovered it ("this work polluted
 * the repo + `~/.copilot` twice before the env-sandbox was right"), and nothing enforced it:
 * the harness sandboxed `AIDD_USER_CONFIG_DIR` for every case and `HOME` for exactly one,
 * so `plugin install --tool codex|copilot|claude` ran against the real home of whoever ran
 * `pnpm smoke`. */
describe("the smoke harness never runs against the real user home", () => {
  it("gives every case a home under its own temporary root", () => {
    expect(harness).toMatch(/export HOME="\$TMPROOT\/[^"]+"/u);
  });

  // `HOME` does not isolate Codex: it reads `CODEX_HOME`, and falls back to the real
  // `~/.codex` when that is unset.
  it("gives Codex its own home too, which HOME alone does not move", () => {
    expect(harness).toMatch(/export CODEX_HOME="\$TMPROOT\/[^"]+"/u);
  });

  // A case that damages a file it picked at random, then asserts only an exit code, proves
  // nothing twice over: it does not know which file it broke, and it never looks at whether
  // the command repaired it. `find` returns directory order, which is neither sorted nor
  // stable across filesystems, so `find … | head -1` on a tree of several files runs a
  // different case on every machine.
  it("picks the file a case damages in a fixed order, never whatever find returns first", () => {
    const unsorted = [...harness.matchAll(/find [^\n|]*\|[ \t]*head\b/gu)].map((m) => m[0]);

    expect(unsorted).toEqual([]);
  });

  // Ordering is the whole guard: the token is resolved through `gh`, which reads the real
  // home. Exporting the sandbox before that line makes every authenticated case silently
  // unauthenticated, so the sandbox must come after it and before the first case that runs.
  it("resolves the token before moving home, and moves it before the first case", () => {
    const token = harness.indexOf("gh auth token");
    const home = harness.search(/export HOME="\$TMPROOT/u);
    const firstCase = harness.indexOf("section ");

    expect(token).toBeGreaterThan(-1);
    expect(home).toBeGreaterThan(token);
    expect(home).toBeLessThan(firstCase);
  });
});

/** A `restore --force` that returns 0 having restored nothing is exactly the failure #762
 * fixed in the command itself, and the smoke case that was supposed to cover it asserted the
 * exit code alone. An exit code is not a repair. */
describe("a smoke case that damages a file checks the damage was undone", () => {
  it("marks the drift it writes, so the check can name what it is looking for", () => {
    expect(harness).toContain("SMOKE_DRIFT");
  });

  it("looks for that mark again after every run that follows a planted drift", () => {
    // The mark is planted, then a repairing run follows, then `repaired` reads the file back.
    // Pairing the check to the run that follows the planting, rather than to a verb, is what
    // survives the verb being renamed: `restore` became `sync` and the invariant did not move.
    const lines = harness.split("\n");
    const planted = lines
      .map((line, index) => (/"\$DRIFT_MARK" >> /u.test(line) ? index : -1))
      .filter((index) => index >= 0);
    const runsAfterPlanting = planted.map((index) => {
      const next = lines.slice(index + 1).find((line) => /^\s*run "/u.test(line));
      return /run "([^"]+)"/u.exec(next ?? "")?.[1];
    });
    const checks = [...harness.matchAll(/repaired "([^"]+)"/gu)].map((match) => match[1]);

    expect(runsAfterPlanting.length).toBeGreaterThan(0);
    expect(checks.sort()).toEqual([...runsAfterPlanting].sort());
  });
});
