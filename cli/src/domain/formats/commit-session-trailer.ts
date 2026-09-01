/**
 * The one link between a commit and the session that produced it.
 *
 * Every other link in the chain a record can be read along already exists: a request names
 * its turn, a turn names its session, a session names the task folder it declared. What
 * nothing named was the commit — so "this backlog item cost X" could be answered, and "this
 * commit cost X" could not, though the two are one query apart.
 *
 * A commit carries `AIDD-Session-Id: <session anchor>` and the join closes. The value is
 * whatever `session-anchor.ts` resolves — never a second identifier minted for this, which
 * would be a second identity for one thing.
 *
 * **How far that join is measured, by host, because it is not the same distance for both.**
 *
 * On Claude Code it is measured: `CLAUDE_CODE_SESSION_ID` is the transcript filename, and
 * `claude-code-transcript.ts`'s own `matchesMainTranscript` resolves a session by
 * `<sessionId>.jsonl`, so the variable and the record's `vendor_id` are the same string.
 *
 * On Codex it is **unconfirmed**, and there is a specific reason to doubt it rather than a
 * general one. A record's `vendor_id` there is the rollout's own `session_meta.id` — the
 * uuid in `rollout-<timestamp>-<uuid>.jsonl`, as `codex.cjs` states and measured across
 * every rollout on disk "including resumed ones where it differs from
 * `session_meta.session_id`". `CODEX_THREAD_ID` names a thread, and a resumed thread spans
 * two rollouts; if it names the first, a commit made in the second joins to nothing. The
 * captured rollout in `cli/tests/fixtures/local-cost` is exactly such a resumed session and
 * carries both values, different — but nothing captured so far carries that variable beside
 * them, so which one it equals has never been read off a real session.
 *
 * What would settle it is one Codex session's `CODEX_THREAD_ID` captured beside the rollout
 * it wrote. Until then a consumer treats a Codex trailer as a link to check, not one to
 * rely on — see the same shape of stated limit on `opencode.ts`'s own counters.
 *
 * `telemetry-claim.ts`'s `firedForSession` compares the anchor to `vendorId` already, but it
 * settles nothing here: on Codex a mismatch and a hook that never fired produce the same
 * unproven claim.
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
