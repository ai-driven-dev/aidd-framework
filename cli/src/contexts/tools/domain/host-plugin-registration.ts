import type { AiToolId } from "../../../kernel/tool.js";
import type {
  HostPluginRegistryEntry,
  HostPluginRegistryReading,
} from "./ports/host-plugin-registry-reader.js";

/**
 * Whether a host will actually load a plugin AIDD installed for it — the comparison
 * `telemetry`'s own diagnostic and `framework`'s `doctor` both need and neither owns. A
 * project's settings can carry a perfectly good `enabledPlugins` entry while the host's
 * registry knows nothing about it, at which point the host drops the entry as orphaned and
 * every visible signal still says healthy.
 *
 * Pure, and driven from whatever the caller already resolved as expected, never from a settings
 * file: a plugin a settings sync skipped would otherwise be absent from both sides of the
 * comparison and read as agreement while it never loads.
 */
export interface HostRegistration {
  /** One per plugin whose registration can be asked about at all. Empty when nothing was
   * expected, which is a normal state, not a fault. */
  readonly entries: readonly HostRegistrationEntry[];
}

/**
 * Four answers, and none of them collapses into another. `registered-disabled` is not a shade
 * of `registered`: Codex records `enabled` per plugin table, so `enabled = false` is a host that
 * knows the plugin and still declines it. `unanswerable` is not a shade of `not-registered`: an
 * unknown is never a zero, and a registry that is absent, unreadable, or JSONC where JSON was
 * expected has said nothing — Copilot's own `config.json` opens with two `//` lines, so a naive
 * parse throws on the first registry a reader meets.
 */
export type HostRegistrationAnswer =
  | "registered"
  | "registered-disabled"
  | "not-registered"
  | "unanswerable";

export interface HostRegistrationEntry {
  readonly tool: AiToolId;
  readonly plugin: string;
  /** `<plugin>@<marketplace>`, the one string all three measured hosts key their registry on.
   * Absent exactly when no marketplace was recorded, the case no registry can be asked about. */
  readonly ref?: string;
  readonly answer: HostRegistrationAnswer;
  /** One sentence naming what was read and what it said, so the answer can be acted on
   * rather than merely believed. */
  readonly detail: string;
}

/** What one tool contributes to the comparison: the plugins expected for it, and what its
 * registry answered — `undefined` when nothing here knows how to ask that host, a different
 * fact from asking and getting nothing back. */
export interface HostRegistrationEvidence {
  readonly tool: AiToolId;
  readonly plugins: readonly { readonly name: string; readonly marketplace?: string }[];
  readonly reading?: HostPluginRegistryReading;
  /** Whether the tool declares a native activation at all. The two silences are different
   * problems: a tool declaring none has no registry to look for, while one that declares an
   * activation and has no reader here has a registry nobody has measured. */
  readonly declaresNativeActivation?: boolean;
}

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
  const entry = answered.refs.get(ref);
  if (entry === undefined) {
    return {
      answer: "not-registered",
      detail: `${answered.location} does not carry ${ref} — ${tool} will drop the declaration as orphaned`,
    };
  }
  if (!entry.enabled) {
    return {
      answer: "registered-disabled",
      detail: `${answered.location} carries ${ref} and records it disabled`,
    };
  }
  return { answer: "registered", detail: answered.location };
}

/**
 * Either the refs a registry actually produced, or the reason nothing did — one value, so no
 * branch can reach a lookup against a registry that never opened.
 *
 * Three reasons, not one, because they send a person somewhere different: a tool that drives its
 * own CLI keeps a registry somebody could go and measure, a tool that declares no native
 * activation has none to look for, and a registry found but unreadable names the file and the
 * failure.
 */
export function answeredRegistry(
  tool: AiToolId,
  reading: HostPluginRegistryReading | undefined,
  declaresNativeActivation: boolean | undefined
):
  | { readonly refs: ReadonlyMap<string, HostPluginRegistryEntry>; readonly location: string }
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
