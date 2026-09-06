import type { AiToolId } from "../../../kernel/tool.js";
import type { HostPluginRegistryReading } from "./ports/host-plugin-registry-reader.js";

/**
 * Whether a host will actually load a plugin AIDD installed for it — the comparison
 * `telemetry`'s own diagnostic and `framework`'s `doctor` both need, and neither owns: a
 * project's settings can carry a perfectly good `enabledPlugins` entry while the host's
 * registry knows nothing about it, at which point the host drops the entry as orphaned and
 * every visible signal still says healthy. `claude --debug-file` says it in one line
 * nobody passes the flag to see: `Skipping orphaned enabledPlugins entry …: marketplace
 * not registered`.
 *
 * Pure, and driven from whatever the caller already resolved as expected — the manifest's
 * own record for `telemetry`, `nativeRegistrations` for `doctor` — never from a settings
 * file: a plugin a settings sync skipped would otherwise be absent from both sides of the
 * comparison and read as agreement while it never loads.
 */
export interface HostRegistration {
  /** One per plugin whose registration can be asked about at all. Empty when nothing was
   * expected, which is a normal state, not a fault. */
  readonly entries: readonly HostRegistrationEntry[];
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
 */
export type HostRegistrationAnswer =
  | "registered"
  | "registered-disabled"
  | "not-registered"
  | "unanswerable";

export interface HostRegistrationEntry {
  readonly tool: AiToolId;
  readonly plugin: string;
  /** `<plugin>@<marketplace>`, the one string all three measured hosts key their registry
   * on and the same string `enabledPlugins` uses. Absent exactly when no marketplace was
   * recorded for the plugin, which is the case no registry can be asked about. */
  readonly ref?: string;
  readonly answer: HostRegistrationAnswer;
  /** One sentence naming what was read and what it said, so the answer can be acted on
   * rather than merely believed. */
  readonly detail: string;
}

/** What one tool contributes to the comparison: the plugins expected for it, and what its
 * registry answered — `undefined` when nothing here knows how to ask that host, which is a
 * different fact from asking and getting nothing back. */
export interface HostRegistrationEvidence {
  readonly tool: AiToolId;
  readonly plugins: readonly { readonly name: string; readonly marketplace?: string }[];
  readonly reading?: HostPluginRegistryReading;
  /** Whether the tool declares a native activation at all — it drives its own CLI to
   * register a plugin, so a registry exists to be found. Carried because the two silences
   * are different problems: a tool that declares none has no registry to read, while one
   * that declares an activation and has no reader here has a registry nobody has measured.
   * Telling a person the first when the second is true would send them looking for a file
   * that does not exist. */
  readonly declaresNativeActivation?: boolean;
}

/**
 * The comparison itself: for every plugin expected, what the host's own registry says
 * about it.
 */
export function buildHostRegistration(
  evidence: readonly HostRegistrationEvidence[]
): HostRegistration {
  const entries: HostRegistrationEntry[] = [];
  for (const item of evidence) {
    const { tool, plugins, reading } = item;
    for (const plugin of plugins) {
      entries.push(hostRegistrationEntry(tool, plugin, reading, item.declaresNativeActivation));
    }
  }
  return { entries };
}

function hostRegistrationEntry(
  tool: AiToolId,
  plugin: { readonly name: string; readonly marketplace?: string },
  reading: HostPluginRegistryReading | undefined,
  declaresNativeActivation: boolean | undefined
): HostRegistrationEntry {
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
  return {
    tool,
    plugin: plugin.name,
    ref,
    ...answerForRef(tool, ref, reading, declaresNativeActivation),
  };
}

/** What one registry says about one ref, given the reading it produced. Split from the
 * entry it becomes so the two absences above — no ref to ask about, and no registry to ask
 * — stay visibly separate from the four answers a registry can give. */
function answerForRef(
  tool: AiToolId,
  ref: string,
  reading: HostPluginRegistryReading | undefined,
  declaresNativeActivation: boolean | undefined
): { answer: HostRegistrationAnswer; detail: string } {
  const answered = answeredRegistry(tool, reading, declaresNativeActivation);
  if ("detail" in answered) return answered;
  const enabled = answered.refs.get(ref);
  if (enabled === undefined) {
    return {
      answer: "not-registered",
      detail: `${answered.location} does not carry ${ref} — ${tool} will drop the declaration as orphaned`,
    };
  }
  if (!enabled) {
    return {
      answer: "registered-disabled",
      detail: `${answered.location} carries ${ref} and records it disabled`,
    };
  }
  return { answer: "registered", detail: answered.location };
}

/**
 * Either the refs a registry actually produced, or the reason nothing did — returned as
 * one value so the caller never has to re-narrow, and so no branch can reach a lookup
 * against a registry that never opened.
 *
 * Three reasons, not one, because they send a person somewhere different: a tool that
 * drives its own CLI keeps a registry somebody could go and measure, a tool that declares
 * no native activation has none to look for at all, and a registry that was found and
 * could not be read names the file and the failure.
 *
 * Exported for `doctor`'s own ref-level check: it already holds fully-formed refs from
 * `nativeRegistrations` and asks this once per tool, rather than once per ref the way
 * `buildHostRegistration` does through `answerForRef` above.
 */
export function answeredRegistry(
  tool: AiToolId,
  reading: HostPluginRegistryReading | undefined,
  declaresNativeActivation: boolean | undefined
):
  | { readonly refs: ReadonlyMap<string, boolean>; readonly location: string }
  | { readonly answer: "unanswerable"; readonly detail: string } {
  if (reading === undefined) {
    return {
      answer: "unanswerable",
      detail:
        declaresNativeActivation === true
          ? `${tool} keeps a plugin registry, and nothing here has established its shape`
          : `${tool} declares no plugin registry to read`,
    };
  }
  if (reading.refs === undefined) {
    return {
      answer: "unanswerable",
      detail: `${reading.location} could not be read — ${reading.unreadable ?? "no reason given"}`,
    };
  }
  return { refs: reading.refs, location: reading.location };
}
