/**
 * Canonical path constants for the GitHub Copilot workspace layout.
 *
 * Exported from a dedicated file so both `copilot.ts` (tool definition) and
 * flat-mode build helpers can import from a single source of truth, without
 * introducing a cross-layer dependency.
 */

/** Root directory for all Copilot workspace files. */
export const COPILOT_WORKSPACE_DIR = ".github/";

/** Workspace-level VS Code MCP configuration path. */
export const COPILOT_VSCODE_MCP_PATH = ".vscode/mcp.json";
