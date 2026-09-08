/**
 * The registry of projects that reference the one shared, machine-scope source a CLI
 * version builds — `userConfigDir()/references.json`, `{ "<version>": ["<projectRoot>",
 * …] }`. Written by `setup` and `sync`, decremented by `clean`: what lets a project drop
 * its own claim without a `clean --scope user` (not yet built) ever having to guess
 * whether another project still needs the source before removing it.
 *
 * A help, not an authority, in two ways: a `projectRoot` a person deleted with `rm -rf`
 * decrements nothing here, so every read ignores an entry whose `projectRoot` no longer
 * exists rather than counting it as still live; and a file this CLI cannot make sense of
 * — corrupted JSON, or a shape `parseReferencesFile` refuses — must never block `setup`,
 * `sync` or `clean`, none of which this file gates. Every caller reaches it through
 * `cli/src/contexts/framework/application/shared/shared-source-reference-support.ts`'s
 * guard, never a bare call.
 */
export interface UserSourceReferences {
  /** Records that `projectRoot` references the shared source built for `version` —
   * replacing any reference it held under a *different* version first, since a project
   * holds at most one at a time: an `aidd update` between two runs must not leave a
   * stale claim behind under the version it has since moved on from. Idempotent under
   * the same version. */
  addReference(version: string, projectRoot: string): Promise<void>;

  /** Drops `projectRoot`'s own reference, wherever it is recorded — never asking which
   * version, since the running CLI's own current version is not necessarily the one
   * this project last registered under (a self-update between `sync` and `clean` would
   * make them differ, and `addReference`'s own invariant already guarantees there is at
   * most one to find). Reports how many other still-existing projects remain under that
   * same version; `undefined` when `projectRoot` held no reference at all. */
  removeReference(projectRoot: string): Promise<{ remainingCount: number } | undefined>;

  /** The same count `removeReference` would report, without dropping anything — what a
   * dry-run names before acting. `undefined` when `projectRoot` holds no reference. */
  countReferencesForProject(projectRoot: string): Promise<number | undefined>;

  /** Every project this file still names as referencing the shared source, across
   * every version key at once — deduplicated, and, same as every other read here, a
   * `projectRoot` that no longer exists is left out rather than counted as still live.
   * What `clean --scope user`'s own confirmation names before it purges the source out
   * from under every project this lists: the one read with no single `projectRoot` of
   * its own to key off, unlike every other method on this port. */
  listAllReferencingProjects(): Promise<readonly string[]>;
}
