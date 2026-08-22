import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  PersonIdentity,
  PersonIdentityReader,
} from "../../domain/ports/person-identity-reader.js";

// Mirrors the plugin's own `skills/_shared/identity.js`, field for field and path for
// path - the two must agree on where this file lives and what it holds, or the same person
// reads as two people depending on which side ran the local read.
function identityDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "aidd");
  }
  return join(homedir(), ".config", "aidd");
}

function identityFilePath(): string {
  return join(identityDir(), "identity.json");
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseIdentity(raw: string): PersonIdentity | null {
  const parsed = asObject(JSON.parse(raw));
  if (typeof parsed.person_id !== "string" || parsed.person_id === "") return null;
  const identity: { personId: string; displayName?: string } = { personId: parsed.person_id };
  if (typeof parsed.display_name === "string" && parsed.display_name !== "") {
    identity.displayName = parsed.display_name;
  }
  return identity;
}

/** Reads only this machine's own user profile - `homedir()` already honors `HOME` on
 * POSIX, the same way the plugin's `readers.js` resolves it, and this adapter never reads
 * `AIDD_USER_CONFIG_DIR`. That variable is documented as a location a team or a CI can
 * point every figure at; a choice reachable that way would not be this person's own. */
export class PersonIdentityAdapter implements PersonIdentityReader {
  async read(): Promise<PersonIdentity | null> {
    try {
      return parseIdentity(await readFile(identityFilePath(), "utf8"));
    } catch {
      return null;
    }
  }
}
