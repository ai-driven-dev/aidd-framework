import type { AuthConfig, AuthCredential, AuthLevel } from "../auth.js";

export interface CredentialFileSaveOptions {
  credential: AuthCredential;
  level: AuthLevel;
  projectRoot: string;
}

/** Declared as a port so a test's stand-in is held to the same signatures the real store
 * has: a cast around the whole class let one drift out of shape, and nothing said so. */
export interface CredentialFileStore {
  userConfigPath(): string;
  projectConfigPath(projectRoot: string): string;
  read(path: string): Promise<AuthConfig | null>;
  readActive(projectRoot: string): Promise<AuthConfig | null>;
  save(options: CredentialFileSaveOptions): Promise<void>;
  delete(path: string): Promise<void>;
}
