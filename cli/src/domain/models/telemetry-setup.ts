import type { HostPluginRegistryReading } from "../ports/host-plugin-registry-reader.js";
import { personRefusesTelemetry, TELEMETRY_REFUSAL_VARIABLE } from "./telemetry-switch.js";
import type { AiToolId } from "./tool-ids.js";

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
 * plugin in its own registry (`claude-cli-adapter.ts`'s measured case). This fact states
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
  readonly entries: readonly TelemetryHostRegistrationEntry[];
  /** Every registry location consulted, whatever each one answered, so a person can go and
   * look at the same file this did. The same set regardless of the outcome, mirroring
   * `TelemetryRecorderDeclarationSetup.locationsChecked`. */
  readonly locationsChecked: readonly string[];
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
 * Four answers, and none of them collapses into another.
 *
 * `registered-disabled` is its own answer rather than a shade of `registered` because
 * folding it in would report a plugin that will not load as one that will — Codex records
 * `enabled` per plugin table and nothing else, so `enabled = false` is a host that knows
 * the plugin and still declines it.
 *
 * `unanswerable` is its own answer rather than a shade of `not-registered` for the rule
 * this whole layer is built on: an unknown is never a zero. A registry that cannot be read
 * — absent, unreadable, or JSONC where JSON was expected — has said nothing, and printing
 * that as "not registered" would invent a fact. Copilot's own `~/.copilot/config.json`
 * opens with two `//` comment lines, so this is not hypothetical: a naive parse throws on
 * the first registry a reader meets.
 *
 * **A fifth answer was designed and is not built here.** The plan distinguished a plugin
 * the host does not carry from one that never reached the project's own `enabledPlugins`
 * at all, which happens because `mergeEnabledPlugins` skips silently twice. Telling those
 * apart needs the set of declared refs per tool, and `TelemetryEvidenceReader` exposes no
 * accessor for it — `readRecorderDeclaration` looks for the recorder specifically, not for
 * every declared key. Adding one is a port method, an adapter method and their tests, for a
 * distinction between two flavours of the same outcome: the plugin will not load. The
 * comparison here starts from the manifest, which is what made that distinction visible in
 * the first place and is the half that matters; the second hop is named in #703's own
 * thread rather than half-built. */
export type TelemetryHostRegistrationAnswer =
  | "registered"
  | "registered-disabled"
  | "not-registered"
  | "unanswerable";

export interface TelemetryHostRegistrationEntry {
  readonly tool: AiToolId;
  readonly plugin: string;
  /** `<plugin>@<marketplace>`, the one string all three measured hosts key their registry
   * on and the same string `enabledPlugins` uses. Absent exactly when the manifest records
   * no marketplace for the plugin, which is the case no registry can be asked about. */
  readonly ref?: string;
  readonly answer: TelemetryHostRegistrationAnswer;
  /** One sentence naming what was read and what it said, so the answer can be acted on
   * rather than merely believed. */
  readonly detail: string;
}

/** What one tool contributes to the comparison: the plugins AIDD's own manifest records for
 * it, and what its registry answered — `undefined` when nothing here knows how to ask that
 * host, which is a different fact from asking and getting nothing back. */
export interface TelemetryHostRegistrationEvidence {
  readonly tool: AiToolId;
  readonly plugins: readonly { readonly name: string; readonly marketplace?: string }[];
  readonly reading?: HostPluginRegistryReading;
}

/**
 * The comparison itself: for every plugin AIDD installed, what the host's own registry says
 * about it.
 *
 * Pure, and driven from the manifest rather than from any settings file, for the reason
 * `TelemetryHostRegistrationSetup` states — a plugin the settings sync skipped would
 * otherwise be absent from both sides and read as agreement.
 */
export function buildHostRegistration(
  evidence: readonly TelemetryHostRegistrationEvidence[]
): TelemetryHostRegistrationSetup {
  const entries: TelemetryHostRegistrationEntry[] = [];
  const locationsChecked: string[] = [];
  for (const { tool, plugins, reading } of evidence) {
    if (reading !== undefined && !locationsChecked.includes(reading.location)) {
      locationsChecked.push(reading.location);
    }
    for (const plugin of plugins) {
      entries.push(hostRegistrationEntry(tool, plugin, reading));
    }
  }
  return { entries, locationsChecked };
}

function hostRegistrationEntry(
  tool: AiToolId,
  plugin: { readonly name: string; readonly marketplace?: string },
  reading: HostPluginRegistryReading | undefined
): TelemetryHostRegistrationEntry {
  // No marketplace recorded means no ref exists to look up — every measured host keys its
  // registry on `<plugin>@<marketplace>`, so this is unanswerable at the source rather than
  // a lookup that failed.
  if (plugin.marketplace === undefined || plugin.marketplace === "") {
    return {
      tool,
      plugin: plugin.name,
      answer: "unanswerable",
      detail: "AIDD records no marketplace for it, so no host registry can be asked",
    };
  }
  const ref = `${plugin.name}@${plugin.marketplace}`;
  return { tool, plugin: plugin.name, ref, ...askRegistry(tool, ref, reading) };
}

/** What one registry says about one ref, given the reading it produced. Split from the
 * entry it becomes so the two absences above — no ref to ask about, and no registry to ask
 * — stay visibly separate from the four answers a registry can give. */
function askRegistry(
  tool: AiToolId,
  ref: string,
  reading: HostPluginRegistryReading | undefined
): { answer: TelemetryHostRegistrationAnswer; detail: string } {
  if (reading === undefined) {
    return {
      answer: "unanswerable",
      detail: `nothing here knows where ${tool} keeps its plugin registry`,
    };
  }
  if (reading.refs === undefined) {
    return {
      answer: "unanswerable",
      detail: `${reading.location} could not be read — ${reading.unreadable ?? "no reason given"}`,
    };
  }
  const enabled = reading.refs.get(ref);
  if (enabled === undefined) {
    return {
      answer: "not-registered",
      detail: `${reading.location} does not carry ${ref} — ${tool} will drop the declaration as orphaned`,
    };
  }
  if (!enabled) {
    return {
      answer: "registered-disabled",
      detail: `${reading.location} carries ${ref} and records it disabled`,
    };
  }
  return { answer: "registered", detail: reading.location };
}
