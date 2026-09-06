import type { HostRegistrationEntry } from "../../tools/domain/host-plugin-registration.js";
import { personRefusesTelemetry, TELEMETRY_REFUSAL_VARIABLE } from "./telemetry-switch.js";

/**
 * What is already in place before `aidd telemetry check` grades whether anything
 * recorded — the answer to "where would I go look, and whose choice was this" that today
 * only a person reading several different files by hand could assemble. Printed first,
 * and printed whether or not measurement is even on: that is exactly when a person needs
 * it, and today it is exactly when they get nothing.
 *
 * Every fact here names the location it came from, so a person can go and change it, and
 * carries no count and no figure of any kind — the report owns those, and a diagnostic
 * that starts repeating quantities becomes a second report that can disagree with the
 * first.
 */
export interface TelemetrySetup {
  readonly allowed: TelemetryAllowedSetup;
  readonly identity: TelemetryIdentitySetup;
  readonly recordsLocation: TelemetryRecordsLocationSetup;
  readonly recorderDeclaration: TelemetryRecorderDeclarationSetup;
  readonly hostRegistration: TelemetryHostRegistrationSetup;
  readonly commitTrailer: TelemetryCommitTrailerSetup;
  readonly versions: TelemetryVersionsSetup;
}

/** Which build of which piece produced what a person is reading.
 *
 * Two producers, and only one of them can be asked directly. The CLI's own version is here
 * in this process; the plugin's is a fact about a different program, on a different
 * schedule, and the only honest source for it is what that program itself wrote — so it is
 * read back out of the journal rather than re-derived. Re-deriving it would mean a third
 * copy of `plugin-version.cjs`'s two-route lookup, in a process that never ran the hook,
 * able to disagree with the lines actually on disk. */
export interface TelemetryVersionsSetup {
  readonly cli: string;
  readonly plugin: TelemetryPluginVersionSetup;
}

/** Three answers, and only the first is a version.
 *
 * `"unrecorded"` and `"nothing-journalled"` are deliberately apart: the first is a hook
 * that ran and could not name its own build — the plugin's manifest was not beside its
 * hooks and no `aidd` install recorded one, which is a plugin copied in by hand. The second
 * is a project where nothing has been measured yet, and says nothing about the plugin at
 * all. Collapsing them would let "not measured yet" read as "damaged install". */
export type TelemetryPluginVersionSetup =
  | { readonly kind: "recorded"; readonly version: string }
  | { readonly kind: "unrecorded" }
  | { readonly kind: "nothing-journalled" };

/** Whether AIDD is allowed to measure this project, and whose decision that is. Mirrors
 * `resolveTelemetryEnabled`'s own precedence exactly, so this can never disagree with the
 * gate that decides whether `check` even reaches its four claims: a person's own refusal
 * wins unconditionally over whatever the project file says. */
export interface TelemetryAllowedSetup {
  readonly allowed: boolean;
  /** `"person-refusal"`: `AIDD_TELEMETRY=0` decided it, whatever the project file holds.
   * `"project-switch"`: the project's own tracked file decided it — on, off, absent, or
   * unreadable are all still that file's decision, never this person's own. */
  readonly decidedBy: "person-refusal" | "project-switch";
  /** The env var name for `"person-refusal"`; the switch file's path for
   * `"project-switch"` — where a person would go to change this. */
  readonly location: string;
  /** Reading an env var never fails, so this is always `true` for `"person-refusal"`.
   * `false` for `"project-switch"` only when the file exists but could not be read or
   * parsed — a damaged file is not the same choice as an absent or an explicit one. */
  readonly readable: boolean;
}

/** What `buildTelemetryAllowedSetup` needs from the project's switch file — the primitives
 * alone, never `TelemetrySwitchSetupRead` itself: that type lives on the port this model
 * must not depend on, and importing it back here for one function would draw a domain
 * model into the port layer it is the port's job to abstract away from. */
export interface TelemetrySwitchFileFacts {
  readonly path: string;
  readonly enabled: boolean;
  readonly readable: boolean;
}

/** Builds `TelemetryAllowedSetup` from the project's switch file and the environment,
 * mirroring `resolveTelemetryEnabled`'s own precedence exactly: a person's own refusal
 * wins unconditionally, whatever the project file says. Pure, so the precedence itself —
 * not just its effect on the gate `resolveTelemetryEnabled` decides — has its own test,
 * independent of the adapter that reads the switch file or the use case that calls this. */
export function buildTelemetryAllowedSetup(
  switchFile: TelemetrySwitchFileFacts,
  env: NodeJS.ProcessEnv
): TelemetryAllowedSetup {
  if (personRefusesTelemetry(env)) {
    return {
      allowed: false,
      decidedBy: "person-refusal",
      location: TELEMETRY_REFUSAL_VARIABLE,
      readable: true,
    };
  }
  return {
    allowed: switchFile.enabled,
    decidedBy: "project-switch",
    location: switchFile.path,
    readable: switchFile.readable,
  };
}

/** Whether this person attached their own identifier to what gets read locally, and where
 * that file lives. There is no file to fail to read when nobody has ever opted in, so
 * `attached: false, readable: true` is the ordinary "nobody chose" case — `readable` is
 * only ever `false` for a file that exists but is damaged. */
export interface TelemetryIdentitySetup {
  readonly attached: boolean;
  readonly path: string;
  readonly readable: boolean;
}

/** Where `aidd telemetry read`/`report` keep what they store — the sink's own root
 * directory, resolved by nothing but the adapter that already owns it. No `readable`:
 * naming a directory never fails, whether or not anything has been written into it yet. */
export interface TelemetryRecordsLocationSetup {
  readonly path: string;
}

/** Whether the recorder — the `aidd-telemetry` plugin whose hook has to fire for anything
 * else here to have material to judge — is declared anywhere this build knows to check:
 * the AIDD manifest a `plugin add` writes, a tool's own settings file declaring its
 * enabled plugins, or a hooks block that invokes the recorder's own entry point directly
 * (Claude's nested `hooks` key, or Cursor's project-scope flat file — the marketplace
 * route is not the only one this build can see). A declaration is not proof the hook will
 * fire: a declared entry is silently dropped as orphaned when a host never registers the
 * plugin in its own registry (`native-plugin-cli-adapter.ts`'s measured case). This fact states
 * only that a declaration was found; whether the host will act on it is
 * `TelemetryHostRegistrationSetup`, directly below. */
export interface TelemetryRecorderDeclarationSetup {
  readonly declared: boolean;
  /** Where it was found declared — non-empty exactly when `declared` is `true`. */
  readonly declaredAt: readonly string[];
  /** Every location this build knows to check, so a person can go add it there when
   * `declared` is `false` — the same set regardless of the outcome. */
  readonly locationsChecked: readonly string[];
  /** Every checked location that exists but could not be read or parsed — a trailing
   * comma, a `//` comment, unreadable permissions. Mirrors the switch file and identity's
   * own `readable` fact, the same "a damaged file is not a choice" distinction, just
   * carried as a list here because more than one location is ever checked at once.
   * Non-empty only makes sense alongside `declared: false`: a declaration actually found
   * at one readable location is real regardless of what else could not be read, so a
   * consumer should only look at this when `declared` is `false`. */
  readonly unreadable: readonly string[];
}

/**
 * Whether the host will actually load what AIDD installed — the other half of
 * `TelemetryRecorderDeclarationSetup`, which answers only whether a declaration exists.
 *
 * Two facts, two different files, and #703 is the gap between them: a project's own
 * settings can carry a perfectly good `enabledPlugins` entry while the host's registry
 * knows nothing about it, at which point the host drops the entry as orphaned and every
 * visible signal still says healthy. `claude --debug-file` says it in one line nobody
 * passes the flag to see: `Skipping orphaned enabledPlugins entry …: marketplace not
 * registered`.
 *
 * **Read from AIDD's own manifest, never from `enabledPlugins`.** That is not a
 * preference: `mergeEnabledPlugins` iterates the manifest and skips silently twice — once
 * for a plugin recording no marketplace, once for a marketplace that does not resolve
 * (`marketplace-sync-settings-use-case.ts`). A plugin installed under either condition
 * reaches no settings file at all, so comparing settings against a registry would find
 * both sides absent and read it as agreement while the plugin never loads. The manifest is
 * what that loop reads from, so it is what this reads from too.
 *
 * Costs no session, no network and no money: every fact here comes from files already on
 * disk, which is what makes it answerable before a person has spent anything.
 */
export interface TelemetryHostRegistrationSetup {
  /** One per plugin AIDD installed for a tool whose registration can be asked about at
   * all. Empty when the manifest records no plugin, which is a normal state, not a fault. */
  readonly entries: readonly HostRegistrationEntry[];
  /** Why AIDD's own manifest could not be read, when it could not.
   *
   * Its own field rather than an absent-entries silence, and this is not defensive
   * programming: `Manifest`'s parser reads `files.map(...)` on each tool without guarding
   * the field, so a hand-edited or truncated `.aidd/manifest.json` throws a `TypeError`
   * rather than returning null. Before this fact existed, `aidd telemetry check` never
   * loaded the manifest at all — measuring it is what put that crash on the diagnostic's
   * path, so the diagnostic is what has to survive it. A damaged manifest is exactly when a
   * person runs `check`, and the one thing it must not do then is die. */
  readonly manifestUnreadable?: string;
}

/**
 * Whether a commit made by a session will carry it, and whether any actually has.
 *
 * The trailer is the one link that closes "this commit cost X". It is installed as a single
 * line in `prepare-commit-msg`, and in a repository where another tool generates that file
 * the line is erased the next time it regenerates — a loss with no symptom, since commits
 * keep succeeding and records keep being written. `check` had no claim about any of this;
 * these are the five facts that make the loss visible, and the hook now repairs the call
 * site on the next session so this is a report rather than a chore.
 *
 * Four of the five describe pieces. `recentlyCarrying` is the only one that describes the
 * chain: it reads git's own history, so it answers whether commits are actually being
 * stamped rather than whether the parts that should stamp them are in place.
 */
export interface TelemetryCommitTrailerSetup {
  /** Where git says it runs hooks from — `git rev-parse --git-path hooks`, never
   * `.git/hooks` assumed, because `core.hooksPath` pointing elsewhere is exactly the
   * configuration under which everything else here would describe the wrong directory. */
  readonly hooksDir?: string;
  /** Why there is no `hooksDir`, when there is none. Two causes, never one sentence: a
   * project outside git has no hook to carry anything, which is a fact about the project;
   * a repository whose git could not answer is a reading that failed, and saying "no
   * repository" about it would be false — measured against a git that rejects `--git-path`,
   * which reported exactly that inside a repository with commits. */
  readonly hooksDirMissing?: "no-repository" | "unresolved";
  /** Whether the delegate script is there and executable. A file present but not executable
   * is its own state: git will not run it, and saying "installed" would be a lie a person
   * could not act on. */
  readonly delegate: "executable" | "not-executable" | "absent";
  /** Whether `prepare-commit-msg` carries the line that calls the delegate. */
  readonly callSite: "present" | "missing" | "no-hook-file";
  /** Whether that hook is executable, when there is one. Git refuses to run a hook without
   * the bit and prints a hint on every commit; a regeneration that drops it leaves an
   * install that looks perfect and writes nothing. Absent when there is no hook to ask
   * about — a third state, not a `false`. */
  readonly hookExecutable?: boolean;
  /** Whether that hook holds anything besides our own line — true where lefthook, husky or a
   * hand-written hook owns the file. Said, never named: which tool it is changes nothing a
   * person does, and naming one would be a guess from its contents. */
  readonly hookHasOtherContent: boolean;
  /** How many of the commits looked at actually carry the trailer, and how many were looked
   * at. A count, never a pass: "some of your recent commits carry it" is not something a
   * person can check, and zero out of twenty in a repository that has been measuring for a
   * week is the whole finding. Absent when history could not be read at all. */
  readonly recentlyCarrying?: { readonly carrying: number; readonly examined: number };
}
