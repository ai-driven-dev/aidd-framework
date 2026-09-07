// Registers every tool profile as a side effect, so the registry `nativeActivationOf`
// reads is populated regardless of which other wiring module gets imported first.
import "../../contexts/tools/domain/profiles/claude/profile.js";
import "../../contexts/tools/domain/profiles/codex/profile.js";
import "../../contexts/tools/domain/profiles/copilot/profile.js";
import "../../contexts/tools/domain/profiles/cursor/profile.js";
import "../../contexts/tools/domain/profiles/opencode/profile.js";
import "../../contexts/tools/domain/profiles/vscode/profile.js";
import type { HostMarketplaceRegistryReader } from "../../contexts/tools/domain/ports/host-marketplace-registry-reader.js";
import type { NativePluginActivator } from "../../contexts/tools/domain/ports/native-plugin-activator.js";
import { nativeActivationOf } from "../../contexts/tools/domain/registry.js";
import { hostMarketplaceRegistryReaders } from "../../contexts/tools/infrastructure/host-marketplace-registry-reader-adapter.js";
import { NativePluginCliAdapter } from "../../contexts/tools/infrastructure/native-plugin-cli-adapter.js";
import { AI_TOOL_IDS, type AiToolId } from "../../kernel/tool.js";

/**
 * One native plugin CLI adapter per tool whose profile declares an activation shape —
 * read off the registry rather than listed by hand, so a sixth tool costs no edit here.
 */
export function wireTools(): {
  nativePluginActivators: Map<string, NativePluginActivator>;
  hostMarketplaceRegistries: ReadonlyMap<AiToolId, HostMarketplaceRegistryReader>;
} {
  const nativePluginActivators = new Map<string, NativePluginActivator>([
    ...AI_TOOL_IDS.map((id) => {
      const activation = nativeActivationOf(id);
      return activation === undefined
        ? undefined
        : ([activation.binary, new NativePluginCliAdapter(activation.binary, activation)] as const);
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined),
  ]);
  return { nativePluginActivators, hostMarketplaceRegistries: hostMarketplaceRegistryReaders() };
}
