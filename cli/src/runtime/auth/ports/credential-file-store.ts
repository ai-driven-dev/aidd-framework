import type { AuthConfig, AuthCredential, AuthLevel } from "../auth.js";

/** What saving one credential needs: which credential, at which level, for which project. */
export interface CredentialFileSaveOptions {
  credential: AuthCredential;
  level: AuthLevel;
  projectRoot: string;
}

/**
 * Where credentials are kept on disk, as the provider adapter needs them.
 *
 * The adapter reads and writes through six methods; the class behind them has a seventh.
 * Declared as a port so a test's stand-in is held to the same signatures the real store
 * has — a cast around the whole class let one drift into taking no `projectRoot` and a
 * different save shape, and nothing said so.
 */
export interface CredentialFileStore {
  userConfigPath(): string;
  projectConfigPath(projectRoot: string): string;
  read(path: string): Promise<AuthConfig | null>;
  readActive(projectRoot: string): Promise<AuthConfig | null>;
  save(options: CredentialFileSaveOptions): Promise<void>;
  delete(path: string): Promise<void>;
}
