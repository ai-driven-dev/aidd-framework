import type { HookManager } from "../telemetry-setup.js";

/** The one link between a commit and the session that produced it: every other hop exists, so a
 * trailer carrying whatever `session-anchor.ts` resolves — never a second identifier minted here
 * — makes "this commit cost X" answerable. Both hosts' anchors equal the `vendor_id` records join
 * on, except inside a Codex subagent, where the anchor may name the delegating thread instead. */

/** Capitalised the way `Co-authored-by` and `Signed-off-by` are: `git interpret-trailers`
 * matches a token case-insensitively but writes back what it was given, and a history spelling
 * one trailer three ways is one nobody can grep. */
export const SESSION_TRAILER_TOKEN = "AIDD-Session-Id";

/** The delegate lives beside the hook that calls it rather than inside it, so a repository
 * already running a `prepare-commit-msg` hook keeps it and gains one line calling this. */
export const SESSION_TRAILER_DELEGATE_FILE = "aidd-session-trailer.sh";

/** What a `prepare-commit-msg` written from scratch starts with, and — read back — the one
 * line that does not count as somebody else's content. One spelling for both sides, or a
 * freshly installed hook reports as somebody else's. */
export const SESSION_TRAILER_HOOK_HEADER = "#!/bin/sh";

/** Both the line appended to `prepare-commit-msg` and the marker read back to detect it, so the
 * two sides cannot spell it differently; `"$@"` forwards git's own arguments. Separators are
 * forced to `/`: the `sh` Git for Windows ships treats a backslash inside double quotes as an
 * ordinary character, so a path Node resolved there would arrive literally and name nothing. */
export function sessionTrailerHookLine(delegatePath: string): string {
  return `sh "${delegatePath.replace(/\\/gu, "/")}" "$@"`;
}

/** Resolved at run time rather than baked in at write time, so a hand-added line survives
 * being carried into a checkout living somewhere else. The `[ -f "$delegate" ]` guard keeps a
 * later `aidd telemetry off`, which deletes only the script, from leaving every commit calling
 * a file that no longer exists. */
function delegateLookup(delegateFile: string): string {
  return `delegate="$(git rev-parse --git-common-dir)/hooks/${delegateFile}"`;
}

/** `{1}` and `{2}` are lefthook's own placeholders for the message-file and source arguments
 * git passes a `prepare-commit-msg` hook — the counterpart of `"$@"` in a plain shell hook. */
export function sessionTrailerLefthookJob(delegateFile: string): string {
  return `prepare-commit-msg:
  commands:
    aidd-session-trailer:
      run: |
        ${delegateLookup(delegateFile)}
        if [ -f "$delegate" ]; then sh "$delegate" {1} {2}; fi`;
}

/** Husky's own hook is a plain shell script, so `"$@"` forwards git's arguments the way it
 * does for a hook this CLI owns outright. */
export function sessionTrailerHuskyLine(delegateFile: string): string {
  return `${delegateLookup(delegateFile)}
[ -f "$delegate" ] && sh "$delegate" "$@"`;
}

/** Lefthook's snippet goes under a top-level `prepare-commit-msg:` key, so "add this job to
 * lefthook.yml" followed literally would give a file that already has one a duplicate YAML
 * key. Husky's hook has no such structure, and a line is still a line there. */
export function sessionTrailerManagerInstruction(manager: HookManager, targetFile: string): string {
  return manager === "lefthook"
    ? `add this command under \`prepare-commit-msg:\` in ${targetFile}`
    : `add this line to ${targetFile}`;
}

/** The one place both `telemetry on` and `telemetry check` read this from, so the file named
 * and the snippet printed cannot drift apart. */
export function sessionTrailerManagerSnippet(
  manager: HookManager,
  delegateFile: string
): { readonly manager: HookManager; readonly targetFile: string; readonly snippet: string } {
  if (manager === "lefthook") {
    return {
      manager,
      targetFile: "lefthook.yml",
      snippet: sessionTrailerLefthookJob(delegateFile),
    };
  }
  return {
    manager,
    targetFile: ".husky/prepare-commit-msg",
    snippet: sessionTrailerHuskyLine(delegateFile),
  };
}

/** POSIX `sh`, no Node, no dependency on this CLI still being installed. A hook that fails is a
 * commit that fails, so every path ends in `exit 0`. Variable precedence is `session-anchor.ts`'s;
 * neither set means no AI session made the commit and it gets no trailer. No commit is skipped by
 * `message_source`: a merge a session resolved by hand cost as much as any other change. */
export function sessionTrailerDelegateScript(): string {
  return `#!/bin/sh
# Installed by \`aidd telemetry on\`, removed by \`aidd telemetry off\`.
#
# Names the AI session that authored this commit, so what a session cost can be read
# per commit. Writes nothing when no session made the commit.
set -u

message_file="\${1:-}"

[ -n "$message_file" ] || exit 0

session_id="\${CODEX_THREAD_ID:-\${CLAUDE_CODE_SESSION_ID:-}}"
[ -n "$session_id" ] || exit 0

# --if-exists doNothing keeps an amend, or a second run of this hook, from writing it twice.
git interpret-trailers --in-place --if-exists doNothing \\
  --trailer "${SESSION_TRAILER_TOKEN}=$session_id" "$message_file" || exit 0

exit 0
`;
}
