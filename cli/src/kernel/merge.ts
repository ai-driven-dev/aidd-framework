import type { FileHash } from "./file.js";
import { stripJsonComments } from "./jsonc.js";
import type { Hasher } from "./ports/hasher.js";

// ── MergeStrategy ────────────────────────────────────────────────────────────

export type PerKeyMergeStrategy = {
  default: "framework-prime" | "user-prime";
  /** Keys where framework always wins, overriding the default strategy. */
  frameworkOverrideKeys: readonly string[];
};

export type MergeStrategy = "none" | "framework-prime" | "user-prime" | PerKeyMergeStrategy;

export function isPerKeyMergeStrategy(s: MergeStrategy): s is PerKeyMergeStrategy {
  return typeof s === "object" && s !== null;
}

// ── MergeFileEntry ───────────────────────────────────────────────────────────

export interface MergeFileEntry {
  readonly relativePath: string;
  readonly sectionKey: string | null;
  readonly entries: Readonly<Record<string, FileHash>>;
}

export function extractMergeEntries(
  jsonContent: string,
  sectionKey: string | null,
  hasher: Hasher
): Record<string, FileHash> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripJsonComments(jsonContent)) as Record<string, unknown>;
  } catch {
    return {};
  }
  const container = resolveContainer(parsed, sectionKey);
  if (container === null || typeof container !== "object" || Array.isArray(container)) return {};
  const result: Record<string, FileHash> = {};
  for (const [key, value] of Object.entries(container as Record<string, unknown>)) {
    result[key] = hasher.hash(JSON.stringify(value));
  }
  return result;
}

function resolveContainer(parsed: Record<string, unknown>, sectionKey: string | null): unknown {
  if (sectionKey === null) return parsed;
  return parsed[sectionKey] ?? null;
}

export function removeEntriesFromJson(
  content: string,
  sectionKey: string | null,
  keysToRemove: string[]
): string {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const container =
    sectionKey !== null
      ? ((parsed[sectionKey] as Record<string, unknown> | undefined) ?? {})
      : parsed;
  for (const key of keysToRemove) {
    delete (container as Record<string, unknown>)[key];
  }
  return JSON.stringify(parsed, null, 2);
}

export function isMergeContentEmpty(content: string, sectionKey: string | null): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (sectionKey === null) return Object.keys(parsed).length === 0;
    const otherKeys = Object.keys(parsed).filter((k) => k !== sectionKey);
    if (otherKeys.length > 0) return false;
    const section = parsed[sectionKey] as Record<string, unknown> | undefined;
    return !section || Object.keys(section).length === 0;
  } catch {
    return false;
  }
}
