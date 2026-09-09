import type { AuthCredential, AuthLevel } from "../auth.js";

export type AuthLogoutHint = "external-provider-cleanup";

export interface AuthLoginResult {
  login: string;
  level: AuthLevel;
}

export type AuthStatus =
  | { authenticated: true; login: string; level: AuthLevel }
  | { authenticated: false };

export type AuthLogoutResult =
  | { found: false }
  | { found: true; level: AuthLevel; hint?: AuthLogoutHint };

export interface CredentialStore {
  login(credential: AuthCredential, level: AuthLevel): Promise<AuthLoginResult>;
  status(): Promise<AuthStatus>;
  logout(): Promise<AuthLogoutResult>;
}
