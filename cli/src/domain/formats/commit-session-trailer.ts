/**
 * The one link between a commit and the session that produced it.
 *
 * Every other link in the chain a record can be read along already exists: a request names
 * its turn, a turn names its session, a session names the task folder it declared. What
 * nothing named was the commit — so "this backlog item cost X" could be answered, and "this
 * commit cost X" could not, though the two are one query apart.
 *
 * A commit carries `AIDD-Session-Id: <vendor id>` and the join closes. The value is the same
 * identifier a record's own `vendor_id` carries, never a second one minted for this: on
 * Claude Code `CLAUDE_CODE_SESSION_ID` is the transcript filename the local reader resolves
 * a session by, and `telemetry-claim.ts`'s own `firedForSession` has compared the two as
 * equal since the "hook fired" claim existed. A different identifier here would be a second
 * identity for one thing.
 */

/** Git's own trailer token. Capitalised the way `Co-authored-by` and `Signed-off-by` are,
 * because `git interpret-trailers` matches a token case-insensitively but writes back what
 * it was given, and a repository whose history spells one trailer three ways is one nobody
 * can grep. */
export const SESSION_TRAILER_TOKEN = "AIDD-Session-Id";

/** The delegate's own filename, beside the hook that calls it rather than inside it: a
 * repository that already runs a `prepare-commit-msg` hook (lefthook, husky, a hand-written
 * one) keeps it, and gains one line calling this. Overwriting theirs to install ours would
 * be the kind of silent theft a measurement tool has no business committing. */
export const SESSION_TRAILER_DELEGATE_FILE = "aidd-session-trailer.sh";

/** The line appended to `prepare-commit-msg`, and the marker read back to tell an install
 * that already happened from one that has not. `"$@"` forwards git's own three arguments —
 * the message file, where the message came from, and the commit being amended — because the
 * delegate reads the first two and a hook that dropped them would trailer a merge. */
export function sessionTrailerHookLine(delegatePath: string): string {
  return `sh "${delegatePath}" "$@"`;
}

/**
 * The delegate itself: POSIX `sh`, no Node, no dependency on this CLI still being installed.
 * A hook that fails is a commit that fails, so every path here ends in `exit 0` — measurement
 * is never allowed to stand between a person and their own commit.
 *
 * `CODEX_THREAD_ID` is read before `CLAUDE_CODE_SESSION_ID`, the same precedence and for the
 * same measured reason as `session-anchor.ts`: a Codex process nested inside a Claude Code
 * session inherits the outer session's variable, and trailering the enclosing session would
 * name work it did not do. Neither variable set means no AI session made this commit, and
 * the commit gets no trailer at all — an unknown is never a guess.
 *
 * A merge or a squash is skipped: neither is a person authoring work, and a merge commit
 * carrying a session id would attribute every commit it brings in to that one session.
 */
export function sessionTrailerDelegateScript(): string {
  return `#!/bin/sh
# Installed by \`aidd telemetry on\`, removed by \`aidd telemetry off\`.
#
# Names the AI session that authored this commit, so what a session cost can be read
# per commit. Writes nothing when no session made the commit.
set -u

message_file="\${1:-}"
message_source="\${2:-}"

[ -n "$message_file" ] || exit 0

# A merge or a squash is not a person authoring work.
case "$message_source" in
  merge | squash) exit 0 ;;
esac

session_id="\${CODEX_THREAD_ID:-\${CLAUDE_CODE_SESSION_ID:-}}"
[ -n "$session_id" ] || exit 0

# --if-exists doNothing keeps an amend, or a second run of this hook, from writing it twice.
git interpret-trailers --in-place --if-exists doNothing \\
  --trailer "${SESSION_TRAILER_TOKEN}=$session_id" "$message_file" || exit 0

exit 0
`;
}
