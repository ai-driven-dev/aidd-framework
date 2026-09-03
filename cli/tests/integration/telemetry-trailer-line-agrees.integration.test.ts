import { describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  sessionTrailerHookLine,
} from "../../src/domain/formats/commit-session-trailer.js";
import { journalTrailerRepair } from "../helpers/telemetry-journal-hook.js";

/**
 * The one literal this feature spells twice, held to itself across the language boundary.
 *
 * `aidd telemetry on` writes the call site from TypeScript; the hook restores it from
 * zero-dependency CommonJS shipped into a person's repository, and cannot import the CLI's
 * own function — the CLI may not be installed when the hook runs, which is the whole point
 * of the hook needing nothing. So the line exists in two places.
 *
 * This is what stops them drifting, and it is the shape this plugin's other cross-language
 * literal already uses: the real hook module is loaded and asked, and its answer is compared
 * against the real CLI function's — never against a third copy typed into a fixture, which
 * would only prove that the fixture agrees with whoever wrote it last.
 *
 * If they ever diverge, `aidd telemetry on` installs one line and the hook restores a
 * different one, so a repaired repository silently stops trailering while both sides pass
 * their own tests.
 */
describe("the hook and the CLI spell the call site identically", () => {
  it.each([
    ["a POSIX path", "/home/dev/repo/.git/hooks"],
    ["a path with spaces", "/Users/dev/My Projects/repo/.git/hooks"],
    [
      "a Windows path, where the separator is the whole difficulty",
      "C:\\Users\\dev\\repo\\.git\\hooks",
    ],
  ])("agrees on %s", (_shape, hooksDir) => {
    const delegatePath = `${hooksDir}/${SESSION_TRAILER_DELEGATE_FILE}`;

    expect(journalTrailerRepair.hookLine(delegatePath)).toBe(sessionTrailerHookLine(delegatePath));
  });

  it("agrees on the delegate's filename, which decides where each side looks", () => {
    expect(journalTrailerRepair.DELEGATE_FILE).toBe(SESSION_TRAILER_DELEGATE_FILE);
  });
});
