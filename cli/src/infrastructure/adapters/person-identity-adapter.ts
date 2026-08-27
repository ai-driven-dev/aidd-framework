import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { UnreadableIdentityFileError } from "../../domain/errors.js";
import type { PersonIdentity } from "../../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../domain/ports/person-identity-store.js";
import { IdentityWriteError } from "../errors.js";
import { resolveHomeDir } from "../home-dir.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;

// Mirrors the plugin's own `skills/00-init/scripts/lib/identity.cjs`, field for field and path for
// path - the two must agree on where this file lives and what it holds, or the same person
// reads as two people depending on which side ran the local read.
function identityDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "aidd");
  }
  return join(resolveHomeDir(), ".config", "aidd");
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

// The exact on-disk shape `identity.cjs`'s `writeIdentity` produces: `person_id` before
// `display_name` (from its own `{ ...existing, display_name: value }`), two-space indent,
// one trailing newline. Byte parity with the script is the claim task 4 pins, and it lives
// in this one function rather than at every call site.
function serializeIdentity(identity: PersonIdentity): string {
  const record: { person_id: string; display_name?: string } = { person_id: identity.personId };
  if (identity.displayName !== undefined) record.display_name = identity.displayName;
  return `${JSON.stringify(record, null, 2)}\n`;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads and writes only this machine's own user profile - `resolveHomeDir()` honors `HOME`
 * on every platform, the same way the plugin's `readers.cjs`/`identity.cjs` resolve it, and
 * this adapter never reads `AIDD_USER_CONFIG_DIR`. That variable is documented as a location
 * a team or a CI can point every figure at; a choice reachable that way would not be this
 * person's own. */
export class PersonIdentityAdapter implements PersonIdentityStore {
  get filePath(): string {
    return identityFilePath();
  }

  async read(): Promise<PersonIdentity | null> {
    try {
      return parseIdentity(await readFile(identityFilePath(), "utf8"));
    } catch {
      return null;
    }
  }

  async readStrict(): Promise<PersonIdentity | null> {
    const raw = await this.readFileOrNull();
    if (raw === null) return null;
    try {
      return parseIdentity(raw);
    } catch (error) {
      throw new UnreadableIdentityFileError(identityFilePath(), describeError(error));
    }
  }

  async mint(): Promise<PersonIdentity> {
    const identity: PersonIdentity = { personId: randomUUID() };
    await this.write(identity);
    return identity;
  }

  async setDisplayName(identity: PersonIdentity, displayName: string): Promise<PersonIdentity> {
    const next: PersonIdentity = { ...identity, displayName };
    await this.write(next);
    return next;
  }

  // `recursive: true` is what lets this discard a damaged identity file that turns out to
  // be a directory (the Test Scope's own "the identity file is unreadable" edge case) —
  // `off` is a privacy control, and withdrawing must not depend on the damage taking one
  // particular shape. `force: true` folds "already gone" into success rather than a
  // separate ENOENT branch.
  async forget(): Promise<void> {
    try {
      await rm(identityFilePath(), { recursive: true, force: true });
    } catch (error) {
      throw new IdentityWriteError(identityFilePath(), error, "remove");
    }
  }

  private async readFileOrNull(): Promise<string | null> {
    try {
      return await readFile(identityFilePath(), "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return null;
      throw new UnreadableIdentityFileError(identityFilePath(), describeError(error));
    }
  }

  private async write(identity: PersonIdentity): Promise<void> {
    const filePath = identityFilePath();
    try {
      await mkdir(dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE });
      await writeFile(filePath, serializeIdentity(identity), { mode: PRIVATE_FILE_MODE });
    } catch (error) {
      throw new IdentityWriteError(filePath, error);
    }
  }
}
