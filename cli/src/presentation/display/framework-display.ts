import type { ToolId } from "../../kernel/tool.js";
import type { CLIOutput } from "../output.js";

interface ScopedFailure {
  readonly scope: string;
  readonly message: string;
}

interface UpdatedTool {
  readonly toolId: ToolId;
  readonly fileCount: number;
}

export function printToolAlreadyInstalled(output: CLIOutput, toolId: ToolId): void {
  output.warn(`${toolId} is already installed. Use \`--force\` to reinstall.`);
}

export function printToolInstalled(
  output: CLIOutput,
  toolId: ToolId,
  fileCount: number,
  warnings: readonly string[]
): void {
  for (const warning of warnings) output.warn(warning);
  output.success(`Installed ${toolId} (${fileCount} files)`);
}

export function printToolRemoved(output: CLIOutput, toolId: ToolId, fileCount: number): void {
  output.success(`Removed ${toolId} (${fileCount} files removed)`);
}

export function printScopedFailures(output: CLIOutput, failures: readonly ScopedFailure[]): void {
  for (const failure of failures) output.warn(`[${failure.scope}] ${failure.message}`);
}

export function printUpdateResult(
  output: CLIOutput,
  updatedTools: readonly UpdatedTool[],
  errors: readonly ScopedFailure[]
): void {
  if (updatedTools.length === 0 && errors.length === 0) {
    output.info("No tools installed.");
    return;
  }
  for (const tool of updatedTools) {
    output.success(`Updated ${tool.toolId} (${tool.fileCount} files)`);
  }
  printScopedFailures(output, errors);
}
