import { readFile, realpath } from "node:fs/promises";
import { describeError } from "../../../kernel/describe-error.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../kernel/tool.js";
import type {
  HostMarketplaceRegistryReader,
  HostMarketplaceRegistryReading,
} from "../domain/ports/host-marketplace-registry-reader.js";
import { nativeActivationOf } from "../domain/registry.js";

/**
 * One reader per host whose own profile declares `NativeActivation.marketplaceRegistry`
 * — claude only, today: Codex refuses a re-add from a different source itself and
 * Copilot refuses every re-add, so neither declares a resolver and neither gets a
 * reader here. The path itself is never repeated as a literal in this file: it comes
 * from calling that resolver, the one fact `claude/profile.ts` already carries — a
 * second hard-coded copy of the same path here is exactly what let it drift from the
 * profile unnoticed before.
 *
 * Measured 2026-09-07, `claude plugin marketplace add <dir>` under a relocated `HOME`:
 *
 *   { "<name>": { "source": { "source": "directory", "path": "…" },
 *                 "installLocation": "…", "lastUpdated": "…" } }
 *
 * `installLocation` is the field that decides what the name currently resolves to —
 * `source.path` is what the CLI was pointed at, `installLocation` is what it kept.
 */
export function hostMarketplaceRegistryReaders(
  home: string = resolveHomeDir()
): ReadonlyMap<AiToolId, HostMarketplaceRegistryReader> {
  const readers = new Map<AiToolId, HostMarketplaceRegistryReader>();
  for (const toolId of AI_TOOL_IDS) {
    const registryPath = nativeActivationOf(toolId)?.marketplaceRegistry?.(home);
    if (registryPath === undefined) continue;
    readers.set(toolId, new ClaudeKnownMarketplacesReader(registryPath));
  }
  return readers;
}

class ClaudeKnownMarketplacesReader implements HostMarketplaceRegistryReader {
  constructor(private readonly path: string) {}

  async read(): Promise<HostMarketplaceRegistryReading> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      const described = describeError(error);
      if (described === "ENOENT") return { location: this.path, absent: true };
      return { location: this.path, unreadable: described };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { location: this.path, unreadable: "not a JSON object" };
    }
    const entries = new Map<string, string>();
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      const installLocation = installLocationOf(value);
      if (installLocation === undefined) continue;
      entries.set(name, await resolvedPath(installLocation));
    }
    return { location: this.path, entries };
  }
}

function installLocationOf(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const installLocation = (value as { installLocation?: unknown }).installLocation;
  return typeof installLocation === "string" ? installLocation : undefined;
}

/**
 * Both sides of a source comparison go through `realpath` before they are compared —
 * the same `/var` → `/private/var` lesson `host-plugin-registry-reader-adapter.ts`
 * already paid for. A path that cannot be resolved, most often because its directory
 * no longer exists, falls back to itself rather than throwing: a dead registration
 * should not cost every other entry its answer.
 */
async function resolvedPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}
