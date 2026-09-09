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

/** The one literal this feature spells twice, held to itself across the language boundary: the
 * CLI writes the call site, the hook restores it from CommonJS that cannot import the CLI.
 * Diverged, a repaired repository stops trailering while both sides pass their own tests. */
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

  /** The header a hook written from scratch starts with, and the one line that does not count as
   * somebody else's content when read back. Disagreeing, `check` calls this project's own hook
   * somebody else's. */
  it("agrees on the header a hook written from scratch starts with", () => {
    expect(journalTrailerRepair.HOOK_HEADER).toBe(SESSION_TRAILER_HOOK_HEADER);
  });
});

/** The words the repair answers with, exercised through the module: a caller has to tell a
 * directory the repair declined from one that had nothing to do. The delegate is really
 * written, since without it every call returns `"no-delegate"` and never reaches that guard. */
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
