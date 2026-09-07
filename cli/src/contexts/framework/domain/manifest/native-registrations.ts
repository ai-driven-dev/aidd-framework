/** One marketplace registration a tool's own CLI was asked to make — aidd's own local
 * name for it (`alias`, what this project's registry and `clean`'s own registry lookup
 * key it by) beside what the host actually registered it under (`hostName`, the
 * catalog's own declared name, what every host-facing call — `plugin marketplace
 * remove`, the source-conflict guard's registry lookup — must use instead). The two
 * differ whenever a project chooses a local alias its catalog does not declare itself
 * under, a supported capability since v8: before it, aidd refused that divergence
 * outright, so the two were always equal and one string carried both jobs. */
export interface NativeMarketplaceRegistration {
  readonly alias: string;
  readonly hostName: string;
}

export interface NativeRegistrations {
  readonly binary: string;
  readonly marketplaces: readonly NativeMarketplaceRegistration[];
  readonly pluginRefs: readonly string[];
}

export interface NativeRegistrationsData {
  binary: string;
  marketplaces: NativeMarketplaceRegistration[];
  pluginRefs: string[];
}

export function toNativeRegistrationsData(
  registrations: NativeRegistrations
): NativeRegistrationsData {
  return {
    binary: registrations.binary,
    marketplaces: registrations.marketplaces.map((m) => ({ ...m })),
    pluginRefs: [...registrations.pluginRefs],
  };
}

export function parseNativeRegistrations(
  data: NativeRegistrationsData | undefined
): NativeRegistrations | undefined {
  if (data === undefined) return undefined;
  return {
    binary: data.binary,
    marketplaces: data.marketplaces.map((m) => ({ alias: m.alias, hostName: m.hostName })),
    pluginRefs: [...data.pluginRefs],
  };
}
