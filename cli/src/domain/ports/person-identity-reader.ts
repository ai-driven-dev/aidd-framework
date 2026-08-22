/** What a person chose to attach to records this machine reads locally — never a name
 * derived from a git author, an email, or a hostname, and never present unless the person
 * turned it on for themselves. `displayName` is a later, separate choice: present only
 * once asked for, absent whenever it was not, independent of `personId`. */
export interface PersonIdentity {
  readonly personId: string;
  readonly displayName?: string;
}

/**
 * What a person identity reader promises: the identifier this machine's own user chose to
 * attach, or `null` when nobody did — a missing file, a damaged one, and a default
 * installation all answer the same way, since none of them is a choice. Never throws: an
 * unreadable identity file costs the identity, not the read a local-read sweep is doing.
 *
 * Deliberately reads only the OS user's own profile — see the adapter — never
 * `AIDD_USER_CONFIG_DIR` and never a project's `.aidd/config.json`. Both are settings a
 * repository or a CI job can set, and this choice is not theirs to make.
 */
export interface PersonIdentityReader {
  read(): Promise<PersonIdentity | null>;
}
