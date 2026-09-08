import type { HookManager } from "../telemetry-setup.js";

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
 * `claude-transcript-location.ts`'s own `matchesMainTranscript` resolves a session by
 * `<sessionId>.jsonl`, so the variable and the record's `vendor_id` are the same string.
 *
 * On Codex it is measured too, on 2026-09-02, against two real sessions:
 *
 *   fresh session    CODEX_THREAD_ID = 01a06041… = session_meta.id = the rollout's filename
 *   resumed session  CODEX_THREAD_ID = 01a06041… — and no second rollout was written at all
 *
 * The resume is the half that mattered. This module used to warn that "a thread spans
 * several rollouts, so a commit made in a later one joins to nothing"; `codex exec resume
 * --last` disproved it, appending to the same rollout file rather than opening a new one.
 * `CODEX_THREAD_ID` tracks the rollout, and the rollout's uuid is exactly the `vendor_id`
 * both the hook and the reader join on. So the trailer's value equals the records' own.
 *
 * What that leaves is narrow, named, and bounded. 89 of the 418 rollouts on the machine this
 * was measured on carry `thread_source: "subagent"`, where `session_meta.id` is the
 * subagent's own and `session_meta.session_id` is the parent's. No capture yet says which of
 * the two a subagent's `CODEX_THREAD_ID` carries, so a commit authored from inside a Codex
 * subagent is the one case not measured.
 *
 * The bound is what makes it liveable rather than open-ended: those two identifiers are the
 * subagent and the thread that delegated to it, so the trailer names one or the other and
 * both are the same piece of work. The failure mode is a commit attributed to the parent
 * thread instead of the delegated turn inside it — coarser than intended, never somebody
 * else's session and never a different tree. And where the named rollout has no records
 * read, the result is the ordinary "a join that finds no records on the other side", which
 * this contract already calls a normal outcome.
 *
 * Settling it takes one Codex session that delegates, with `CODEX_THREAD_ID` read from
 * inside the subagent and compared against the rollout that subagent wrote. Nothing forces a
 * delegation from the command line, so it waits for one that happens anyway rather than for
 * a run bought to provoke it.
 *
 * Every ordinary session, fresh or resumed, joins exactly.
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

/** What a `prepare-commit-msg` written from scratch starts with — and, read back, the one
 * line that does not count as somebody else's content. Exported rather than spelled at each
 * site: `git-adapter.ts` writes it when a repository has no hook and reads it again when
 * deciding whether a hook holds anything but ours, and a third spelling there would make a
 * freshly installed hook report as "somebody else's too". */
export const SESSION_TRAILER_HOOK_HEADER = "#!/bin/sh";

/** The line appended to `prepare-commit-msg`, and the marker read back to tell an install
 * that already happened from one that has not. `"$@"` forwards git's own three arguments —
 * the message file, where the message came from, and the commit being amended — so the
 * delegate always gets the message file it needs, whatever git calls it for.
 *
 * The separators are forced to `/`, which is the whole of what makes this work on Windows.
 * A hook is shell, run by the `sh` Git for Windows ships, and that shell does not resolve
 * `C:\Users\…`: inside double quotes a backslash is an ordinary character, so the path
 * arrives literally and names nothing. `C:/Users/…` it resolves fine. Node's own `resolve`
 * hands back backslashes there, so this is the seam where a filesystem path becomes shell
 * text and has to stop being one. On POSIX the replacement matches nothing and the string is
 * unchanged.
 *
 * Both sides go through here — `installCommitMessageDelegate` writes this line and
 * `removeCommitMessageDelegate` looks for it — so the two can never disagree about the
 * spelling, whatever the platform. */
export function sessionTrailerHookLine(delegatePath: string): string {
  return `sh "${delegatePath.replace(/\\/gu, "/")}" "$@"`;
}

/** How the delegate is called when lefthook or husky owns `prepare-commit-msg` and this CLI
 * therefore never appends anything to it. Both forms resolve the delegate the same way,
 * against `$(git rev-parse --git-common-dir)/hooks/<file>` rather than any path baked in at
 * write time — the one thing that makes it survive being carried into a repository this CLI
 * did not write, on a machine whose checkout lives somewhere else entirely. The `[ -f
 * "$delegate" ]` guard is what keeps a later `aidd telemetry off` — which deletes only the
 * script, never these hand-added lines — from leaving every commit calling a file that no
 * longer exists. */
function delegateLookup(delegateFile: string): string {
  return `delegate="$(git rev-parse --git-common-dir)/hooks/${delegateFile}"`;
}

/** The job to hand-add to `lefthook.yml`, in the exact shape lefthook itself expects: `{1}`
 * and `{2}` are lefthook's own placeholders for the message-file and source arguments git
 * passes a `prepare-commit-msg` hook — the counterpart of `"$@"` in a plain shell hook. */
export function sessionTrailerLefthookJob(delegateFile: string): string {
  return `prepare-commit-msg:
  commands:
    aidd-session-trailer:
      run: |
        ${delegateLookup(delegateFile)}
        if [ -f "$delegate" ]; then sh "$delegate" {1} {2}; fi`;
}

/** The line to hand-add to `.husky/prepare-commit-msg`. Husky's own hook is a plain shell
 * script, so `"$@"` forwards git's three arguments exactly the way `sessionTrailerHookLine`
 * does for a hook this CLI owns outright. */
export function sessionTrailerHuskyLine(delegateFile: string): string {
  return `${delegateLookup(delegateFile)}
[ -f "$delegate" ] && sh "$delegate" "$@"`;
}

/** How to introduce the printed job or line to a person adding it by hand.
 *
 * Lefthook's own job is a top-level `prepare-commit-msg:` key
 * (`sessionTrailerLefthookJob`), not a line — a `lefthook.yml` that already carries one gets
 * a duplicate YAML key if "add this job to lefthook.yml" is followed literally. Naming the
 * key it goes under, rather than the file alone, is what keeps that instruction true whether
 * or not the file already has one. Husky's own hook is a plain script with no such structure,
 * so a line is still a line there. */
export function sessionTrailerManagerInstruction(manager: HookManager, targetFile: string): string {
  return manager === "lefthook"
    ? `add this command under \`prepare-commit-msg:\` in ${targetFile}`
    : `add this line to ${targetFile}`;
}

/** Where the job or line above goes, and what it is, for one manager — the one place both
 * `telemetry on` and `telemetry check` read this from, so the file named and the snippet
 * printed can never drift apart from each other. */
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
 * A merge a session resolved by hand is session work: the conflicts it settled cost exactly
 * as much as any other change, and a commit that hid that cost would undercount every
 * resolution the same way. Nothing here is skipped by `message_source` any more.
 */
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
