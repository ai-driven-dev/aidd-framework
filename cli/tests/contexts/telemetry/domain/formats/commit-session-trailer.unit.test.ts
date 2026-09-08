import { describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionTrailerDelegateScript,
  sessionTrailerHookLine,
  sessionTrailerHuskyLine,
  sessionTrailerLefthookJob,
  sessionTrailerManagerSnippet,
} from "../../../../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";

describe("the line added to a repository's own prepare-commit-msg", () => {
  it("forwards git's own arguments, so the delegate always gets the message file it needs", () => {
    expect(sessionTrailerHookLine("/repo/.git/hooks/aidd-session-trailer.sh")).toBe(
      'sh "/repo/.git/hooks/aidd-session-trailer.sh" "$@"'
    );
  });

  it("quotes the path, so a checkout living under a directory with a space still runs", () => {
    const line = sessionTrailerHookLine("/Users/a b/repo/.git/hooks/x.sh");

    expect(line).toContain('"/Users/a b/repo/.git/hooks/x.sh"');
  });

  // A hook is shell, run by the `sh` Git for Windows ships, and that shell does not resolve
  // `C:\Users\…` — inside double quotes a backslash is an ordinary character, so the path
  // would arrive literally and name nothing. Node's `resolve` hands back backslashes there,
  // so this is where a filesystem path stops being one.
  it("writes a Windows path with forward slashes, which is the only form sh resolves", () => {
    const line = sessionTrailerHookLine("C:\\Users\\a\\repo\\.git\\hooks\\x.sh");

    expect(line).toBe('sh "C:/Users/a/repo/.git/hooks/x.sh" "$@"');
    expect(line).not.toContain("\\");
  });

  it("leaves a POSIX path exactly as it was", () => {
    expect(sessionTrailerHookLine("/repo/.git/hooks/x.sh")).toBe('sh "/repo/.git/hooks/x.sh" "$@"');
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

  it("no longer branches on message_source - a merge or a squash is session work too", () => {
    expect(script).not.toContain("merge | squash");
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

describe("what the delegate is called on disk", () => {
  it("is named for what it does, and is a shell script", () => {
    expect(SESSION_TRAILER_DELEGATE_FILE).toBe("aidd-session-trailer.sh");
  });
});

/**
 * The job/line printed for a hand-add when lefthook or husky owns `prepare-commit-msg` and
 * regenerates it, wiping anything this CLI appended. Neither snippet may carry an absolute
 * path — these files are committed and shared across machines, and a path baked in at write
 * time on one contributor's disk would name nothing on anyone else's.
 */
describe("the job printed for a repository lefthook already owns", () => {
  const job = sessionTrailerLefthookJob(SESSION_TRAILER_DELEGATE_FILE);

  it("is the prepare-commit-msg job, keyed the way lefthook.yml expects", () => {
    expect(job).toContain("prepare-commit-msg:");
  });

  it("forwards the message-file and source arguments with lefthook's own placeholders", () => {
    expect(job).toContain("{1} {2}");
  });

  it("only calls the delegate when it is actually there", () => {
    expect(job).toContain("[ -f");
  });

  it("carries no absolute path — resolved fresh against this machine's own git dir instead", () => {
    expect(job).not.toMatch(/\/(Users|home)\//u);
    expect(job).toContain("$(git rev-parse --git-common-dir)");
  });
});

describe("the line printed for a repository husky already owns", () => {
  const line = sessionTrailerHuskyLine(SESSION_TRAILER_DELEGATE_FILE);

  it("forwards git's own arguments the way a plain hook does", () => {
    expect(line).toContain('"$@"');
  });

  it("only calls the delegate when it is actually there", () => {
    expect(line).toContain("[ -f");
  });

  it("carries no absolute path either", () => {
    expect(line).not.toMatch(/\/(Users|home)\//u);
    expect(line).toContain("$(git rev-parse --git-common-dir)");
  });
});

describe("sessionTrailerManagerSnippet — one place naming both the file and its snippet", () => {
  it("names lefthook.yml for lefthook, carrying the same job", () => {
    const result = sessionTrailerManagerSnippet("lefthook", SESSION_TRAILER_DELEGATE_FILE);

    expect(result.targetFile).toBe("lefthook.yml");
    expect(result.snippet).toBe(sessionTrailerLefthookJob(SESSION_TRAILER_DELEGATE_FILE));
  });

  it("names .husky/prepare-commit-msg for husky, carrying the same line", () => {
    const result = sessionTrailerManagerSnippet("husky", SESSION_TRAILER_DELEGATE_FILE);

    expect(result.targetFile).toBe(".husky/prepare-commit-msg");
    expect(result.snippet).toBe(sessionTrailerHuskyLine(SESSION_TRAILER_DELEGATE_FILE));
  });
});
