import type { HostRegistrationEntry } from "../../tools/domain/host-plugin-registration.js";
import { personRefusesTelemetry, TELEMETRY_REFUSAL_VARIABLE } from "./telemetry-switch.js";

/** What is already in place before `aidd telemetry check` grades whether anything recorded,
 * printed whether or not measurement is on. Every fact names the location it came from and
 * carries no count and no figure: the report owns those, and a diagnostic repeating
 * quantities can disagree with it. */
export interface TelemetrySetup {
  readonly allowed: TelemetryAllowedSetup;
  readonly identity: TelemetryIdentitySetup;
  readonly recordsLocation: TelemetryRecordsLocationSetup;
  readonly recorderDeclaration: TelemetryRecorderDeclarationSetup;
  readonly hostRegistration: TelemetryHostRegistrationSetup;
  readonly commitTrailer: TelemetryCommitTrailerSetup;
  readonly versions: TelemetryVersionsSetup;
}

/** Two producers, and only one can be asked directly: the CLI's version is this process's
 * own, while the plugin's is a fact about a different program, so it is read back out of the
 * journal rather than re-derived by a process that never ran the hook. */
export interface TelemetryVersionsSetup {
  readonly cli: string;
  readonly plugin: TelemetryPluginVersionSetup;
}

/** `"unrecorded"` is a hook that ran and could not name its own build - a plugin copied in
 * by hand; `"nothing-journalled"` is a project where nothing has been measured yet and says
 * nothing about the plugin. Collapsing them lets "not measured yet" read as "damaged". */
export type TelemetryPluginVersionSetup =
  | { readonly kind: "recorded"; readonly version: string }
  | { readonly kind: "unrecorded" }
  | { readonly kind: "nothing-journalled" };

/** Whether AIDD is allowed to measure this project, and whose decision that is. Mirrors
 * `resolveTelemetryEnabled`'s precedence exactly so the two can never disagree: a person's
 * own refusal wins unconditionally over whatever the project file says. */
export interface TelemetryAllowedSetup {
  readonly allowed: boolean;
  /** `"person-refusal"`: `AIDD_TELEMETRY=0` decided it, whatever the project file holds.
   * `"project-switch"`: on, off, absent or unreadable are all that file's decision. */
  readonly decidedBy: "person-refusal" | "project-switch";
  /** The env var name for `"person-refusal"`; the switch file's path for
   * `"project-switch"` — where a person would go to change this. */
  readonly location: string;
  /** Always `true` for `"person-refusal"`, since reading an env var never fails. `false`
   * only for a switch file that exists but could not be read: a damaged file is not the
   * same choice as an absent or an explicit one. */
  readonly readable: boolean;
}

/** The primitives `buildTelemetryAllowedSetup` needs from the project's switch file, never
 * the port's own read type: importing that back here would draw a domain model into the
 * layer the port exists to abstract away from. */
export interface TelemetrySwitchFileFacts {
  readonly path: string;
  readonly enabled: boolean;
  readonly readable: boolean;
}

/** Mirrors `resolveTelemetryEnabled`'s precedence exactly: a person's own refusal wins
 * unconditionally, whatever the project file says. Pure, so the precedence itself is
 * testable apart from the adapter that reads the switch file. */
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
 * that file lives. `attached: false, readable: true` is the ordinary "nobody chose" case;
 * `readable` is `false` only for a file that exists but is damaged. */
export interface TelemetryIdentitySetup {
  readonly attached: boolean;
  readonly path: string;
  readonly readable: boolean;
}

/** The sink's own root directory, resolved by nothing but the adapter that owns it. No
 * `readable`: naming a directory never fails, written into or not. */
export interface TelemetryRecordsLocationSetup {
  readonly path: string;
}

/** Whether the `aidd-telemetry` plugin is declared anywhere this build knows to check. A
 * declaration is not proof the hook will fire - a host that never registered the plugin
 * drops the entry as orphaned - so whether the host acts on it is
 * `TelemetryHostRegistrationSetup` below. */
export interface TelemetryRecorderDeclarationSetup {
  readonly declared: boolean;
  /** Where it was found declared — non-empty exactly when `declared` is `true`. */
  readonly declaredAt: readonly string[];
  /** Every location this build knows to check, so a person can go add it there when
   * `declared` is `false` — the same set regardless of the outcome. */
  readonly locationsChecked: readonly string[];
  /** Every checked location that exists but could not be read or parsed - the same "a
   * damaged file is not a choice" distinction `readable` carries elsewhere, as a list since
   * several locations are checked at once. Only meaningful alongside `declared: false`: a
   * declaration found at one readable location is real whatever else failed to read. */
  readonly unreadable: readonly string[];
}

/** Whether the host will actually load what AIDD installed. Read from AIDD's own manifest,
 * never `enabledPlugins`: `mergeEnabledPlugins` skips silently for a plugin recording no
 * marketplace and for one that does not resolve, so comparing settings against a registry
 * finds both sides absent and reads it as agreement. */
export interface TelemetryHostRegistrationSetup {
  /** One per plugin AIDD installed for a tool whose registration can be asked about at all.
   * Empty when the manifest records no plugin, a normal state rather than a fault. */
  readonly entries: readonly HostRegistrationEntry[];
  /** Why AIDD's own manifest could not be read, when it could not - its own field rather
   * than an absent-entries silence, since `Manifest`'s parser reads `files.map(...)`
   * unguarded and a truncated `.aidd/manifest.json` throws rather than returning null. A
   * damaged manifest is exactly when a person runs `check`, so `check` must survive it. */
  readonly manifestUnreadable?: string;
}

/** Whether a commit made by a session will carry the trailer that closes "this commit cost
 * X", and whether any actually has. It is one line in `prepare-commit-msg`, erased whenever
 * another tool regenerates that file - a loss with no symptom, since commits keep succeeding
 * and records keep being written. */
export interface TelemetryCommitTrailerSetup {
  /** Where git says it runs hooks from - `git rev-parse --git-path hooks`, never `.git/hooks`
   * assumed, since `core.hooksPath` elsewhere makes every other fact here describe the
   * wrong directory. */
  readonly hooksDir?: string;
  /** Which tool regenerates `prepare-commit-msg` and wipes anything appended to it, read
   * from marker files at the repository root - never from the hook's own contents, which a
   * regeneration has already overwritten. `undefined` means the CLI still owns the hook. */
  readonly hookManager?: HookManager;
  /** Whether that manager's own config already calls the delegate. Present only when
   * `hookManager` is. `false` is not a fault: it is the ordinary state of a repository
   * nobody has wired up yet, which is what the printed job fixes. */
  readonly managerCallsDelegate?: boolean;
  /** Why there is no `hooksDir`. Two causes, never one: a project outside git has no hook to
   * carry anything, while a repository whose git could not answer is a reading that failed,
   * and saying "no repository" about it would be false. */
  readonly hooksDirMissing?: "no-repository" | "unresolved";
  /** Whether the delegate script is there and executable. Present but not executable is its
   * own state: git will not run it, and "installed" would be a lie nobody could act on. */
  readonly delegate: "executable" | "not-executable" | "absent";
  /** Whether `prepare-commit-msg` carries the line that calls the delegate. */
  readonly callSite: "present" | "missing" | "no-hook-file";
  /** Whether that hook is executable, when there is one. Git refuses to run a hook without
   * the bit, so a regeneration that drops it leaves an install that looks perfect and writes
   * nothing. Absent when there is no hook to ask about - a third state, not a `false`. */
  readonly hookExecutable?: boolean;
  /** Whether that hook holds anything besides our own line. Said, never named: which tool it
   * is changes nothing a person does, and naming one would be a guess from its contents. */
  readonly hookHasOtherContent: boolean;
  /** How many of the commits looked at carry the trailer, and how many were looked at. A
   * count, never a pass: "some of your recent commits carry it" is not something a person
   * can check. Absent when history could not be read at all. */
  readonly recentlyCarrying?: { readonly carrying: number; readonly examined: number };
}

/** The two tools this build knows to regenerate `prepare-commit-msg` out from under
 * whatever the CLI appended to it. */
export type HookManager = "lefthook" | "husky";

/** Every spelling lefthook accepts for its own config file, in the order it looks for
 * them. */
export const LEFTHOOK_MARKER_NAMES = [
  "lefthook.yml",
  "lefthook.yaml",
  ".lefthook.yml",
  ".lefthook.yaml",
] as const;

/** The root marker that means husky owns this repository's hooks. */
export const HUSKY_MARKER_NAME = ".husky";

/** The set a caller probes for existence before calling `detectHookManager`, in one place so
 * the two never drift apart. */
export const HOOK_MANAGER_MARKER_NAMES: readonly string[] = [
  ...LEFTHOOK_MARKER_NAMES,
  HUSKY_MARKER_NAME,
];

/** Decided from root marker files alone, never from the hook's own contents: a manager
 * regenerates the hook on every install, so the append this CLI made is already gone by the
 * time anything reads it. Lefthook wins the tie when both are present. */
export function detectHookManager(rootEntryNames: readonly string[]): HookManager | undefined {
  if (rootEntryNames.some((name) => (LEFTHOOK_MARKER_NAMES as readonly string[]).includes(name))) {
    return "lefthook";
  }
  if (rootEntryNames.includes(HUSKY_MARKER_NAME)) return "husky";
  return undefined;
}
