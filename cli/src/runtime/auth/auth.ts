export type AuthLevel = "project" | "user";
export type AuthMethod = "external" | "stored";

export type AuthCredential =
  | { method: "stored"; token: string }
  | { method: "external"; provider: string };

export interface AuthConfig {
  version: 1;
  method: AuthMethod;
  level: AuthLevel;
  token?: string;
  provider?: string;
  createdAt: string;
}
