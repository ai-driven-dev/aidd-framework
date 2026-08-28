import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { UnreadableIdentityFileError } from "../../domain/errors.js";
import type { PersonIdentity } from "../../domain/ports/person-identity-reader.js";
import type { PersonIdentityStore } from "../../domain/ports/person-identity-store.js";
import { IdentityWriteError } from "../errors.js";
import { resolveAiddConfigDir } from "../home-dir.js";
import { asPlainObject, describeError, isErrnoException } from "../json-file.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;

// Mirrors the plugin's own `skills/00-init/scripts/lib/identity.cjs`, field for field and path for
// path - the two must agree on where this file lives and what it holds, or the same person
// reads as two people depending on which side ran the local read. Directory resolution
// itself lives in `resolveAiddConfigDir` - shared with `person-mapping-adapter.ts`, the
// other adapter whose contract refuses `AIDD_USER_CONFIG_DIR` for the same reason.
function identityFilePath(): string {
  return join(resolveAiddConfigDir(), "identity.json");
}

// A file with no `origin` at all is read as `"minted"`, never guessed as anything else:
// every file written before this change - by this adapter's own earlier shape, or by the
// plugin's now-deleted `identity.cjs` - is exactly what `"minted"` describes, and `origin`
// is only ever knowable at the moment an identity is created or adopted, never afterwards.
function parseIdentity(raw: string): PersonIdentity | null {
  const parsed = asPlainObject(JSON.parse(raw));
  if (typeof parsed.person_id !== "string" || parsed.person_id === "") return null;
  const identity: { personId: string; origin: "minted" | "adopted"; alsoMe: string[] } = {
    personId: parsed.person_id,
    origin: parsed.origin === "adopted" ? "adopted" : "minted",
    alsoMe: Array.isArray(parsed.also_me)
      ? parsed.also_me.filter((v) => typeof v === "string")
      : [],
  };
  if (typeof parsed.display_name === "string" && parsed.display_name !== "") {
    return { ...identity, displayName: parsed.display_name };
  }
  return identity;
}

// `also_me` is omitted from the written file when empty, the same way `display_name` is
// omitted when unset - an empty array is what most identities have, and writing it out on
// every file would make the common case noisier than the shape it describes.
function serializeIdentity(identity: PersonIdentity): string {
  const record: {
    person_id: string;
    origin: "minted" | "adopted";
    display_name?: string;
    also_me?: readonly string[];
  } = { person_id: identity.personId, origin: identity.origin };
  if (identity.displayName !== undefined) record.display_name = identity.displayName;
  if (identity.alsoMe.length > 0) record.also_me = identity.alsoMe;
  return `${JSON.stringify(record, null, 2)}\n`;
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
    const identity: PersonIdentity = { personId: randomUUID(), origin: "minted", alsoMe: [] };
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
