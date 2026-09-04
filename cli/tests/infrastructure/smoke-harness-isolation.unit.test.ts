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
