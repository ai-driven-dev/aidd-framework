// ── Win32 platform transform ─────────────────────────────────────────────────

interface McpServerWin32 {
  command?: string;
  args?: string[];
  [key: string]: unknown;
}

interface McpConfigWin32 {
  mcpServers?: Record<string, McpServerWin32>;
  [key: string]: unknown;
}

function transformMcpForWin32(content: string): string {
  const config = JSON.parse(content) as McpConfigWin32;
  if (!config.mcpServers) return JSON.stringify(config, null, 2);
  for (const server of Object.values(config.mcpServers)) {
    if (server.command === "npx") {
      server.args = ["/c", "npx", ...(server.args ?? [])];
      server.command = "cmd";
    } else if (server.command === "uvx") {
      server.command = "uvx.exe";
    } else if (server.command === "uv") {
      server.command = "uv.exe";
    }
  }
  return JSON.stringify(config, null, 2);
}

export function transformFor(platform: string): ((content: string) => string) | undefined {
  return platform === "win32" ? transformMcpForWin32 : undefined;
}

// ── McpExclusion VO ──────────────────────────────────────────────────────────

export interface McpExclusion {
  readonly configPath: string;
  readonly entryKey: string;
}

export function mcpExclusionEquals(a: McpExclusion, b: McpExclusion): boolean {
  return a.configPath === b.configPath && a.entryKey === b.entryKey;
}

// ── MCP server key extraction and filtering ──────────────────────────────────
