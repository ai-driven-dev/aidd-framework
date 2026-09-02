import type { AiToolId, ToolId } from "../../../kernel/tool.js";

export type IssueSeverity = "info" | "warning" | "error";

export interface DoctorIssue {
  severity: IssueSeverity;
  message: string;
  fix: string;
}

export interface ToolHealth {
  toolId: ToolId;
  fileCount: number;
  mergeFileCount: number;
}

export type PluginIssueKind = "missing" | "hash-mismatch";

export interface PluginIssueEntry {
  toolId: AiToolId;
  pluginName: string;
  issue: PluginIssueKind;
  filePath: string;
}

export interface DoctorReport {
  healthy: boolean;
  toolHealth: ToolHealth[];
  issues: DoctorIssue[];
  pluginIssues: PluginIssueEntry[];
}
