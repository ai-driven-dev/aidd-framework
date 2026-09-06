// ── NativeRegistrations ─────────────────────────────────────────────────────
// What a tool's own CLI was asked to register, for the one tool whose plugins load
// through it: the marketplace names and `<plugin>@<marketplace>` refs `doctor` compares
// against the host's real registry, and `clean` undoes through the same binary. Absent
// for a tool with no `nativeActivation` — there is nothing for its own CLI to have done.

export interface NativeRegistrations {
  readonly binary: string;
  readonly marketplaces: readonly string[];
  readonly pluginRefs: readonly string[];
}

export interface NativeRegistrationsData {
  binary: string;
  marketplaces: string[];
  pluginRefs: string[];
}

export function toNativeRegistrationsData(
  registrations: NativeRegistrations
): NativeRegistrationsData {
  return {
    binary: registrations.binary,
    marketplaces: [...registrations.marketplaces],
    pluginRefs: [...registrations.pluginRefs],
  };
}

export function parseNativeRegistrations(
  data: NativeRegistrationsData | undefined
): NativeRegistrations | undefined {
  if (data === undefined) return undefined;
  return {
    binary: data.binary,
    marketplaces: [...data.marketplaces],
    pluginRefs: [...data.pluginRefs],
  };
}
