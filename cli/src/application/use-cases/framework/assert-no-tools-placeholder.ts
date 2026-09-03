import { FrameworkPlaceholderInPluginError } from "../../../domain/errors.js";

const TOOLS_PLACEHOLDER = "@{{TOOLS}}/";

/**
 * Guards against @{{TOOLS}}/ references inside plugin content.
 * Used by all BuildOutputStrategy implementations.
 */
export function assertNoToolsPlaceholder(
  content: string,
  pluginName: string,
  relPath: string
): void {
  if (content.includes(TOOLS_PLACEHOLDER)) {
    throw new FrameworkPlaceholderInPluginError(pluginName, relPath);
  }
}
