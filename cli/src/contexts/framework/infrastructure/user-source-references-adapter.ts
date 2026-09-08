import { dirname, join } from "node:path";
import { UnreadableUserSourceReferencesError } from "../../../kernel/errors.js";
import { samePathSegment, USER_SOURCE_REFERENCES_FILENAME } from "../../../kernel/paths.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { UserSourceReferences } from "../domain/ports/user-source-references.js";

type ReferencesFile = Record<string, readonly string[]>;

/** The version key `projectRoot` is recorded under, and that key's full roots list —
 * `undefined` when it is recorded nowhere. `addReference`'s own invariant (at most one
 * version per project) means at most one entry ever matches. Path equality goes through
 * `samePathSegment`, never a hand-written `===`/`.includes()`, so a case-insensitive
 * platform (Windows) still matches a project root a real `realpath` returns with
 * different casing. */
function findVersionFor(
  references: ReferencesFile,
  projectRoot: string
): [string, readonly string[]] | undefined {
  for (const [version, roots] of Object.entries(references)) {
    if (roots.some((root) => samePathSegment(root, projectRoot))) return [version, roots];
  }
  return undefined;
}

export class UserSourceReferencesAdapter implements UserSourceReferences {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly userConfigDir: () => string
  ) {}

  async addReference(version: string, projectRoot: string): Promise<void> {
    const references = await this.readAll();
    const alreadyOnlyHere =
      (references[version] ?? []).some((root) => samePathSegment(root, projectRoot)) &&
      Object.entries(references).every(
        ([key, roots]) =>
          key === version || !roots.some((root) => samePathSegment(root, projectRoot))
      );
    if (alreadyOnlyHere) return;
    const next: Record<string, string[]> = {};
    for (const [key, roots] of Object.entries(references)) {
      if (key === version) continue;
      const filtered = roots.filter((root) => !samePathSegment(root, projectRoot));
      if (filtered.length > 0) next[key] = filtered;
    }
    const existingAtVersion = (references[version] ?? []).filter(
      (root) => !samePathSegment(root, projectRoot)
    );
    next[version] = [...existingAtVersion, projectRoot];
    // `projectRoot` is protected from the prune below even though a real caller always
    // passes one that exists (it is always the project currently running): what must
    // never happen is a project vanishing between being recorded and this very write
    // finishing, which would otherwise drop the claim `addReference` was just asked to
    // add.
    await this.write(next, projectRoot);
  }

  async removeReference(projectRoot: string): Promise<{ remainingCount: number } | undefined> {
    const references = await this.readAll();
    const found = findVersionFor(references, projectRoot);
    if (found === undefined) return undefined;
    const [version, roots] = found;
    const remaining = roots.filter((root) => !samePathSegment(root, projectRoot));
    const next = { ...references };
    if (remaining.length > 0) next[version] = remaining;
    else delete next[version];
    await this.write(next);
    return { remainingCount: await this.countExisting(remaining) };
  }

  async countReferencesForProject(projectRoot: string): Promise<number | undefined> {
    const references = await this.readAll();
    const found = findVersionFor(references, projectRoot);
    if (found === undefined) return undefined;
    return this.countExisting(found[1]);
  }

  async listAllReferencingProjects(): Promise<readonly string[]> {
    const references = await this.readAll();
    const seen = new Set<string>();
    for (const roots of Object.values(references)) {
      for (const root of roots) seen.add(root);
    }
    const existing: string[] = [];
    for (const root of seen) {
      if (await this.fs.fileExists(root)) existing.push(root);
    }
    return existing;
  }

  private async countExisting(projectRoots: readonly string[]): Promise<number> {
    let count = 0;
    for (const root of projectRoots) {
      if (await this.fs.fileExists(root)) count++;
    }
    return count;
  }

  private get path(): string {
    return join(this.userConfigDir(), USER_SOURCE_REFERENCES_FILENAME);
  }

  private async readAll(): Promise<ReferencesFile> {
    const path = this.path;
    if (!(await this.fs.fileExists(path))) return {};
    const raw = await this.fs.readFile(path);
    return parseReferencesFile(raw, path);
  }

  /** Every write is the one place a `projectRoot` that has stopped existing is purged
   * from the file entirely, not merely ignored at read time: a read already treats a
   * vanished project as if it were not there (`countExisting`), but until this the file
   * itself never shrank, so it grew forever and every read kept `stat`-ing dead paths.
   * Pruned here, once, rather than at every call site that happens to write, because the
   * file is already fully in hand by the time any caller reaches this. `protectedRoot`
   * is never pruned regardless of its own existence — `addReference` passes the root it
   * was just asked to add, so a write can never drop the very claim it exists to record. */
  private async write(references: ReferencesFile, protectedRoot?: string): Promise<void> {
    const pruned = await this.pruneVanishedRoots(references, protectedRoot);
    await this.fs.createDirectory(dirname(this.path));
    await this.fs.writeFile(this.path, JSON.stringify(pruned, null, 2));
  }

  private async pruneVanishedRoots(
    references: ReferencesFile,
    protectedRoot: string | undefined
  ): Promise<ReferencesFile> {
    const result: ReferencesFile = {};
    for (const [version, roots] of Object.entries(references)) {
      const existing: string[] = [];
      for (const root of roots) {
        const protectedFromPrune =
          protectedRoot !== undefined && samePathSegment(root, protectedRoot);
        if (protectedFromPrune || (await this.fs.fileExists(root))) existing.push(root);
      }
      if (existing.length > 0) result[version] = existing;
    }
    return result;
  }
}

/** Validates the file's shape into a typed value at the adapter boundary — `unknown`
 * never leaks past this point. A version key whose value is not a list of strings is
 * exactly as unreadable as JSON that fails to parse at all: half-trusting a corrupted
 * shape is how a later write would silently drop what could not be validated. */
function parseReferencesFile(raw: string, path: string): ReferencesFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UnreadableUserSourceReferencesError(
      path,
      error instanceof Error ? error.message : "it is not valid JSON"
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UnreadableUserSourceReferencesError(path, "it is not a version-keyed object");
  }
  const result: Record<string, string[]> = {};
  for (const [version, projectRoots] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(projectRoots) || !projectRoots.every((root) => typeof root === "string")) {
      throw new UnreadableUserSourceReferencesError(
        path,
        `its "${version}" entry is not a list of project paths`
      );
    }
    result[version] = projectRoots;
  }
  return result;
}
