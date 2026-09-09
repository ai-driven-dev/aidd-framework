import type { AiTool } from "../../../src/contexts/tools/domain/contracts.js";
import type { AiToolId } from "../../../src/kernel/tool.js";

export function stubAiTool(toolId: AiToolId, capabilities: unknown): AiTool<unknown> {
  return {
    kind: "ai",
    toolId,
    directory: `.${toolId}/`,
    toolSuffix: `.${toolId}.md`,
    signalDir: null,
    displayName: toolId,
    telemetryLocalRead: { kind: "unsupported", reason: "a stub reads nothing" },
    telemetryTaskAttributable: false,
    capabilities,
    rewriteContent: (content: string) => content,
  };
}
