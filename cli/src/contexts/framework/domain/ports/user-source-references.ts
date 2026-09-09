/**
 * The registry of projects that reference the one shared, machine-scope source a CLI version
 * builds — `userConfigDir()/references.json`, `{ "<version>": ["<projectRoot>", …] }`.
 *
 * A help, not an authority, in two ways: an entry whose `projectRoot` no longer exists is ignored
 * rather than counted as still live, and a file this CLI cannot make sense of must never block
 * `setup`, `sync` or `clean`, none of which it gates — every caller reaches it through
 * `shared-source-reference-support.ts`'s guard, never a bare call.
 */
export interface UserSourceReferences {
  /** Replaces any reference `projectRoot` held under a *different* version first, since a project
   * holds at most one at a time: an `aidd update` between two runs must not leave a stale claim
   * behind. Idempotent under the same version. */
  addReference(version: string, projectRoot: string): Promise<void>;

  /** Drops `projectRoot`'s own reference wherever it is recorded, never asking which version: the
   * running CLI's own version is not necessarily the one this project registered under. A no-op
   * when it held none — callers read who else references the source from
   * `listAllReferencingProjects()`, never from this method's return. */
  removeReference(projectRoot: string): Promise<void>;

  /** Every project this file still names, across every version key at once, deduplicated and
   * existing paths only. The one read with no single `projectRoot` of its own to key off. */
  listAllReferencingProjects(): Promise<readonly string[]>;
}
