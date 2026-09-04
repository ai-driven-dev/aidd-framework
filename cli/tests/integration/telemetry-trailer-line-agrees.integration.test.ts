import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_HOOK_HEADER,
  sessionTrailerHookLine,
} from "../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";
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

  it("agrees on the hook's own filename", () => {
    expect(journalTrailerRepair.HOOK_FILE).toBe("prepare-commit-msg");
  });

  /**
   * The header a hook written from scratch starts with, and — read back — the one line that
   * does not count as somebody else's content. If the two sides ever disagreed, a hook the
   * hook created would report through `check` as "somebody else's too", about a file this
   * project wrote itself.
   */
  it("agrees on the header a hook written from scratch starts with", () => {
    expect(journalTrailerRepair.HOOK_HEADER).toBe(SESSION_TRAILER_HOOK_HEADER);
  });
});

/**
 * The words the repair answers with, exercised through the module rather than a spawned
 * hook: this side is where the distinction matters, since a caller has to tell a directory
 * the repair declined from one that simply had nothing to do.
 *
 * The delegate is really written, because without it every call returns `"no-delegate"` from
 * the existence check and never reaches the guard the case is named for — which is how an
 * earlier version of this block passed with that guard deleted.
 */
describe("what the repair reports about a directory it will not write to", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aidd-trailer-declines-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function hooksAt(relative: string): Promise<string> {
    const at = join(root, relative);
    await mkdir(at, { recursive: true });
    await writeFile(join(at, SESSION_TRAILER_DELEGATE_FILE), "#!/bin/sh\nexit 0\n");
    return at;
  }

  it("declines a hooks directory outside the git directory, delegate and all", async () => {
    const shared = await hooksAt(".githooks");
    await mkdir(join(root, ".git"), { recursive: true });

    expect(journalTrailerRepair.repairCommitTrailerHook(shared, join(root, ".git"))).toBe(
      "not-ours-to-write"
    );
  });

  it("repairs one inside it", async () => {
    const inside = await hooksAt(join(".git", "hooks"));

    expect(journalTrailerRepair.repairCommitTrailerHook(inside, join(root, ".git"))).toBe(
      "repaired"
    );
  });

  it("has nothing to do without a hooks directory at all", () => {
    expect(journalTrailerRepair.repairCommitTrailerHook("", join(root, ".git"))).toBe(
      "no-delegate"
    );
  });
});
