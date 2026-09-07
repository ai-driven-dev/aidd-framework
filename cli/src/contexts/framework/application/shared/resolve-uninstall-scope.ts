import type { MarketplaceScope } from "../../../../kernel/scope.js";
import type { HostPluginRegistryReader } from "../../../tools/domain/ports/host-plugin-registry-reader.js";

/**
 * The scope(s) worth asking a host's own CLI to uninstall `ref` at, in the order to try
 * them.
 *
 * The host's own registry is authoritative when it answers for this ref (Claude's own
 * `installed_plugins.json` records the scope an entry was written at) — a single scope,
 * trusted outright. When it does not — no reader exists for this tool at all, the ref
 * is absent from what the registry currently carries, or the host's own registry has no
 * per-entry scope concept (Codex, Copilot are both machine-global) — this falls back to
 * `manifestScope`, the scope this project's own manifest recorded at install time, then
 * the other one.
 *
 * That fallback exists because `manifestScope` can itself be wrong: before scope
 * threading existed, `enablePlugin` carried no scope argument at all, so a real
 * `claude` binary always registered at its own implicit default, `"user"`, regardless
 * of what the manifest went on to record for the plugin's own files. Trying the wrong
 * scope first costs one failed, best-effort attempt — a real `claude` binary refuses a
 * mismatched-scope uninstall outright rather than silently missing it (measured) — never
 * a wrong result, since the caller stops at the first scope that succeeds.
 */
export async function resolveUninstallScopeOrder(
  reader: HostPluginRegistryReader | undefined,
  ref: string,
  projectRoot: string,
  manifestScope: MarketplaceScope
): Promise<readonly MarketplaceScope[]> {
  const registryScope = await readRegistryScope(reader, ref, projectRoot);
  if (registryScope !== undefined) return [registryScope];
  const other: MarketplaceScope = manifestScope === "project" ? "user" : "project";
  return [manifestScope, other];
}

async function readRegistryScope(
  reader: HostPluginRegistryReader | undefined,
  ref: string,
  projectRoot: string
): Promise<MarketplaceScope | undefined> {
  if (reader === undefined) return undefined;
  const reading = await reader.read(projectRoot);
  return reading.refs?.get(ref)?.scope;
}
