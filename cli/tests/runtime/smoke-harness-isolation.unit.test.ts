import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const harness = readFileSync(
  fileURLToPath(new URL("../../scripts/smoke-tools.sh", import.meta.url)),
  "utf8"
);

/** Three of the tools the smoke harness drives activate plugins through their own CLI,
 * which writes into the *user's* home, never the project directory. */
describe("the smoke harness never runs against the real user home", () => {
  it("gives every case a home under its own temporary root", () => {
    expect(harness).toMatch(/export HOME="\$TMPROOT\/[^"]+"/u);
  });

  // `HOME` does not isolate Codex: it reads `CODEX_HOME`, and falls back to the real
  // `~/.codex` when that is unset.
  it("gives Codex its own home too, which HOME alone does not move", () => {
    expect(harness).toMatch(/export CODEX_HOME="\$TMPROOT\/[^"]+"/u);
  });

  // `find` returns directory order, which is neither sorted nor stable across filesystems,
  // so `find … | head -1` on a tree of several files runs a different case on every machine.
  it("picks the file a case damages in a fixed order, never whatever find returns first", () => {
    const unsorted = [...harness.matchAll(/find [^\n|]*\|[ \t]*head\b/gu)].map((m) => m[0]);

    expect(unsorted).toEqual([]);

    // The fixed order comes from `tracked_file`'s own `.sort()`. Neither line above calls
    // `find`, so its removal would fall back to manifest order silently.
    expect(harness).toMatch(/relativePath\)\)\.sort\(\)/u);

    // Two functions reading the manifest to pick a file is two sources of truth for the
    // same question. `tracked_file` must be the only one left.
    expect(harness.match(/manifest\.json/gu)?.length ?? 0).toBe(1);
  });

  // The token is resolved through `gh`, which reads the real home: the sandbox must be
  // exported after that line and before the first case that runs.
  it("resolves the token before moving home, and moves it before the first case", () => {
    const token = harness.indexOf("gh auth token");
    const home = harness.search(/export HOME="\$TMPROOT/u);
    const firstCase = harness.indexOf("section ");

    expect(token).toBeGreaterThan(-1);
    expect(home).toBeGreaterThan(token);
    expect(home).toBeLessThan(firstCase);
  });
});

/** A `restore --force` that returns 0 having restored nothing is the failure this covers,
 * and an exit code alone is not a repair. */
describe("a smoke case that damages a file checks the damage was undone", () => {
  it("marks the drift it writes, so the check can name what it is looking for", () => {
    expect(harness).toContain("SMOKE_DRIFT");
  });

  it("looks for that mark again after every run that follows a planted drift", () => {
    // Pairing the check to the run that follows the planting, rather than to a verb, is what
    // survives the verb being renamed.
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
