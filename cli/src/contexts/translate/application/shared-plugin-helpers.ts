import { FrameworkPlaceholderInPluginError } from "../../../kernel/errors.js";

const TOOLS_PLACEHOLDER = "@{{TOOLS}}/";

/** Guards against `@{{TOOLS}}/` references inside plugin content. */
export function assertNoToolsPlaceholder(
  content: string,
  pluginName: string,
  relPath: string
): void {
  if (content.includes(TOOLS_PLACEHOLDER)) {
    throw new FrameworkPlaceholderInPluginError(pluginName, relPath);
  }
}
