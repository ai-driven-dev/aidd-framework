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
}

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
 * fire — see `claude-cli-adapter.ts`'s own measured case, where a declared entry is
 * silently dropped as orphaned when a headless run never registers the plugin — this fact
 * states only that a declaration was found, never that it works. */
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
