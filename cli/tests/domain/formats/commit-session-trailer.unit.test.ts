import { describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionIdFromCommitMessage,
  sessionTrailerDelegateScript,
  sessionTrailerHookLine,
} from "../../../src/domain/formats/commit-session-trailer.js";

describe("the line added to a repository's own prepare-commit-msg", () => {
  it("forwards git's own arguments, so the delegate can tell a merge from an authored commit", () => {
    expect(sessionTrailerHookLine("/repo/.git/hooks/aidd-session-trailer.sh")).toBe(
      'sh "/repo/.git/hooks/aidd-session-trailer.sh" "$@"'
    );
  });

  it("quotes the path, so a checkout living under a directory with a space still runs", () => {
    const line = sessionTrailerHookLine("/Users/a b/repo/.git/hooks/x.sh");

    expect(line).toContain('"/Users/a b/repo/.git/hooks/x.sh"');
  });
});

describe("the delegate a commit's message actually passes through", () => {
  const script = sessionTrailerDelegateScript();

  it("reads Codex's own variable before Claude Code's, the precedence session-anchor.ts measured", () => {
    // Shell parameter expansion, not a JS placeholder: this literal is what the delegate has
    // to contain, character for character, so it is asserted as written.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the string is shell, not JS
    expect(script).toContain('session_id="${CODEX_THREAD_ID:-${CLAUDE_CODE_SESSION_ID:-}}"');
  });

  it("writes nothing when no session made the commit - an unknown is never a guess", () => {
    expect(script).toContain('[ -n "$session_id" ] || exit 0');
  });

  it("skips a merge and a squash, so one commit never claims the work it brings in", () => {
    expect(script).toContain("merge | squash) exit 0 ;;");
  });

  it("writes the trailer once however often it runs, amend included", () => {
    expect(script).toContain("--if-exists doNothing");
    expect(script).toContain(`--trailer "${SESSION_TRAILER_TOKEN}=$session_id"`);
  });

  it("never fails a commit: every path out of it exits zero", () => {
    const exits = script.match(/exit \d+/gu) ?? [];

    expect(exits.length).toBeGreaterThan(0);
    expect(exits.every((line) => line === "exit 0")).toBe(true);
  });

  // Runs on every commit in the repository, long after whatever installed it. Depending on
  // node, or on this CLI still being on PATH, would make an uninstall break commits.
  it("needs nothing but a shell and git - it runs neither node nor this CLI", () => {
    const instructions = script
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"));

    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(instructions.some((line) => /\bnode\b/u.test(line))).toBe(false);
    expect(instructions.some((line) => /\baidd\b/u.test(line))).toBe(false);
    expect(instructions.some((line) => line.includes("git interpret-trailers"))).toBe(true);
  });

  it("names the commands that install and remove it, where a person will look", () => {
    expect(script).toContain("aidd telemetry on");
    expect(script).toContain("aidd telemetry off");
  });
});

describe("reading a session back out of a commit message", () => {
  it("finds the identifier a trailered commit carries", () => {
    const message = `feat: a thing\n\n${SESSION_TRAILER_TOKEN}: session-abc\n`;

    expect(sessionIdFromCommitMessage(message)).toBe("session-abc");
  });

  it("finds it beside other trailers, whichever order they were written in", () => {
    const message = [
      "fix: another thing",
      "",
      "Co-authored-by: Someone <someone@example.com>",
      `${SESSION_TRAILER_TOKEN}: session-def`,
      "Signed-off-by: Someone <someone@example.com>",
      "",
    ].join("\n");

    expect(sessionIdFromCommitMessage(message)).toBe("session-def");
  });

  it("matches the token however it is cased, the way git itself matches one", () => {
    expect(sessionIdFromCommitMessage("x\n\naidd-session-id: session-ghi\n")).toBe("session-ghi");
  });

  it("answers null for a commit no session made, never an empty string", () => {
    expect(sessionIdFromCommitMessage("chore: nothing to see\n")).toBeNull();
  });

  // A body quoting the token is prose about the trailer, not a trailer. Anchoring to the
  // start of a line is what keeps a commit that documents this feature from claiming a
  // session id of its own.
  it("ignores the token quoted mid-sentence in a commit's own body", () => {
    const message = `docs: explain it\n\nA commit carries ${SESSION_TRAILER_TOKEN}: <id> when a session made it.\n`;

    expect(sessionIdFromCommitMessage(message)).toBeNull();
  });
});

describe("what the delegate is called on disk", () => {
  it("is named for what it does, and is a shell script", () => {
    expect(SESSION_TRAILER_DELEGATE_FILE).toBe("aidd-session-trailer.sh");
  });
});
