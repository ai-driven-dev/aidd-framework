import { InvalidInstallScopeError, InvalidPluginScopeError } from "../../../kernel/errors.js";
import type { AiToolId } from "../../../kernel/tool.js";
import { getToolConfig, isAiTool } from "../../tools/domain/registry.js";

export type InstallScope = "project" | "user";

const VALID_SCOPES: readonly string[] = ["project", "user"];

export function isInstallScope(value: unknown): value is InstallScope {
  return typeof value === "string" && VALID_SCOPES.includes(value);
}

export function parseInstallScope(value: string | undefined): InstallScope | undefined {
  if (value === undefined) return undefined;
  if (!isInstallScope(value)) {
    throw new InvalidInstallScopeError(value);
  }
  return value;
}

export function getToolSupportedScope(toolId: AiToolId): InstallScope {
  const tool = getToolConfig(toolId);
  if (!isAiTool(tool)) return "project";
  const caps = tool.capabilities as Record<string, unknown>;
  const plugins = caps.plugins as { installScope?: InstallScope } | undefined;
  return plugins?.installScope ?? "project";
}

export function assertToolSupportsScope(toolId: AiToolId, requested: InstallScope): void {
  const supported = getToolSupportedScope(toolId);
  if (supported !== requested) {
    throw new InvalidPluginScopeError(toolId, requested, supported);
  }
}
