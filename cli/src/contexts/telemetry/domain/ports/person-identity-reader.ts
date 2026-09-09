/** What a person chose to attach to this machine's records — never derived from a git
 * author, an email or a hostname. One file, one person: nothing here can express a second.
 * `origin` says how the identity came to be, `"adopted"` being a declaration the tool cannot
 * check, which is why no third value is reserved for a verification nothing can perform.
 * `alsoMe` is required and reads back empty rather than absent — only `displayName` uses
 * absence for "not set". */
export interface PersonIdentity {
  readonly personId: string;
  readonly origin: "minted" | "adopted";
  readonly alsoMe: readonly string[];
  readonly displayName?: string;
}

/**
 * The identifier this machine's own user chose, or `null` when nobody did — a missing file, a
 * damaged one and a default installation all answer the same way. Never throws: an unreadable
 * identity file costs the identity, not the local-read sweep around it. Reads only the OS
 * user's own profile, never `AIDD_USER_CONFIG_DIR` and never a project's `.aidd/config.json`,
 * since a repository or a CI job can set those and this choice is not theirs to make.
 */
export interface PersonIdentityReader {
  read(): Promise<PersonIdentity | null>;
}
