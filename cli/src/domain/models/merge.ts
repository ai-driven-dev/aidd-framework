import { stripJsonComments } from "../formats/jsonc.js";
import type { Hasher } from "../ports/hasher.js";
import type { FileHash, InstallationFile } from "./file.js";

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

// ── ConflictDecision ─────────────────────────────────────────────────────────

export type ConflictDecision = "overwrite" | "skip" | "backup";

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
  return hashJsonEntries(container as Record<string, unknown>, hasher);
}

/** Hashes each top-level value of a JSON-serialisable object, one entry per key. */
export function hashJsonEntries(
  entries: Record<string, unknown>,
  hasher: Hasher
): Record<string, FileHash> {
  const result: Record<string, FileHash> = {};
  for (const [key, value] of Object.entries(entries)) {
    result[key] = hasher.hash(JSON.stringify(value));
  }
  return result;
}

function resolveContainer(parsed: Record<string, unknown>, sectionKey: string | null): unknown {
  if (sectionKey === null) return parsed;
  return parsed[sectionKey] ?? null;
}

export function parseEntryKeys(content: string, sectionKey: string): string[] {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const section = parsed[sectionKey];
    if (section === null || typeof section !== "object" || Array.isArray(section)) return [];
    return Object.keys(section as Record<string, unknown>);
  } catch {
    return [];
  }
}

export function removeEntriesFromJson(
  content: string,
  sectionKey: string | null,
  keysToRemove: string[]
): string {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  if (sectionKey === null) {
    for (const key of keysToRemove) delete parsed[key];
    return JSON.stringify(parsed, null, 2);
  }
  const container = (parsed[sectionKey] as Record<string, unknown> | undefined) ?? {};
  for (const key of keysToRemove) delete container[key];
  // A section we emptied out must vanish, not linger as `{}` — a settings file that
  // shares its top level with unrelated keys (Claude's settings.json, permissions and
  // all) must come back byte-identical once every key we own is gone.
  if (Object.keys(container).length === 0) {
    delete parsed[sectionKey];
  } else {
    parsed[sectionKey] = container;
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

export function buildMergeFileEntries(
  distribution: InstallationFile[],
  getEntrySection: (frameworkPath: string) => string | null,
  hasher: Hasher
): MergeFileEntry[] {
  const grouped = new Map<string, MergeFileEntry>();
  for (const file of distribution) {
    if (file.mergeStrategy === "none") continue;
    const sectionKey = file.frameworkPath ? getEntrySection(file.frameworkPath) : null;
    const hashes = extractMergeEntries(file.content, sectionKey, hasher);
    const key = `${file.relativePath}::${sectionKey ?? ""}`;
    const previous = grouped.get(key);
    grouped.set(key, {
      relativePath: file.relativePath,
      sectionKey,
      entries: { ...(previous?.entries ?? {}), ...hashes },
    });
  }
  return [...grouped.values()];
}
