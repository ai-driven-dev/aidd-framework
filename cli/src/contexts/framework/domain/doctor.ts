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

export type PluginIssueKind = "missing" | "hash-mismatch" | "not-installed-on-machine";

export interface PluginIssueEntry {
  toolId: AiToolId;
  pluginName: string;
  issue: PluginIssueKind;
  /** Absent for `not-installed-on-machine`: the fact is one line for the whole
   * plugin, not one path per tracked file. */
  filePath?: string;
}

export interface DoctorReport {
  healthy: boolean;
  toolHealth: ToolHealth[];
  issues: DoctorIssue[];
  pluginIssues: PluginIssueEntry[];
}
