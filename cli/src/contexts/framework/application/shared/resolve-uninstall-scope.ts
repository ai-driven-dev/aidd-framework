import type { MarketplaceScope } from "../../../../kernel/scope.js";
import type { HostPluginRegistryReader } from "../../../tools/domain/ports/host-plugin-registry-reader.js";

/**
 * The scope(s) worth asking a host's own CLI to uninstall `ref` at, in the order to try them.
 *
 * A host's own registry is authoritative when it answers for this ref (claude records the scope an
 * entry was written at) — a single scope, trusted outright. Otherwise — no reader, the ref absent,
 * or a host with no per-entry scope concept (codex, copilot are machine-global) — this falls back
 * to `manifestScope`, then the other one, since a plugin enabled before this CLI passed a scope at
 * all sits at claude's own implicit `"user"` default whatever the manifest recorded. Trying the
 * wrong scope first costs one failed, best-effort attempt: measured, a real `claude` binary refuses
 * a mismatched-scope uninstall outright rather than silently missing it.
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
