import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { UnreadablePersonMappingFileError } from "../../domain/errors.js";
import {
  type PersonMapping,
  type PersonMappingEntry,
  validatePersonMapping,
} from "../../domain/models/person-mapping.js";
import type { PersonMappingStore } from "../../domain/ports/person-mapping-store.js";
import { PersonMappingWriteError } from "../errors.js";
import { resolveAiddConfigDir } from "../home-dir.js";
import { asPlainObject, describeError, isErrnoException } from "../json-file.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;

/** `<profile>/.config/aidd/person-mapping.json` on POSIX, `%APPDATA%/aidd/person-mapping.json`
 * on Windows - beside `identity.json`, never a field inside it. `identity.json` is a byte
 * shape the plugin's plain-node `identity.cjs` writes and the CLI mirrors field for field;
 * the mapping is read only by the CLI's report path and written only by the CLI's own
 * `identity link`/`unlink`, never by a hook, so folding it into that shared shape would put
 * a CLI-only concern into a file two independent writers agree on byte for byte.
 *
 * Directory resolution comes from `resolveAiddConfigDir`, shared with
 * `person-identity-adapter.ts` rather than restated - the two must resolve the same
 * directory or the mapping and the identity it maps would silently live under two homes.
 * Never reads `AIDD_USER_CONFIG_DIR`, the same refusal `PersonIdentityReader` documents: who
 * a record belongs to is not a repository's or a CI job's choice to make. */
function mappingFilePath(): string {
  return join(resolveAiddConfigDir(), "person-mapping.json");
}

function parseEntry(value: unknown): PersonMappingEntry {
  const raw = asPlainObject(value);
  if (typeof raw.person_id !== "string" || raw.person_id === "") {
    throw new Error("a mapping entry is missing its person_id");
  }
  if (!Array.isArray(raw.identities) || !raw.identities.every((v) => typeof v === "string")) {
    throw new Error(`entry '${raw.person_id}' has no valid identities array`);
  }
  const entry: { personId: string; identities: readonly string[]; displayName?: string } = {
    personId: raw.person_id,
    identities: raw.identities,
  };
  if (typeof raw.display_name === "string" && raw.display_name !== "") {
    entry.displayName = raw.display_name;
  }
  return entry;
}

/** Throws on any shape it does not recognise, deliberately: this is only ever called from
 * inside `readStrict`'s own try/catch, which wraps whatever it throws into one
 * `UnreadablePersonMappingFileError` naming the file - a mapping is either read whole or
 * treated as unreadable, never partially trusted. */
function parsePersonMapping(raw: string): PersonMapping {
  const parsed = asPlainObject(JSON.parse(raw));
  if (!Array.isArray(parsed.entries)) throw new Error("mapping has no entries array");
  return { entries: parsed.entries.map(parseEntry) };
}

function serializeEntry(entry: PersonMappingEntry): Record<string, unknown> {
  return {
    person_id: entry.personId,
    identities: entry.identities,
    ...(entry.displayName === undefined ? {} : { display_name: entry.displayName }),
  };
}

function serializePersonMapping(mapping: PersonMapping): string {
  return `${JSON.stringify({ entries: mapping.entries.map(serializeEntry) }, null, 2)}\n`;
}

function findEntryIndex(mapping: PersonMapping, personId: string): number {
  return mapping.entries.findIndex((entry) => entry.personId === personId);
}

function withIdentityAdded(entry: PersonMappingEntry, identity: string): PersonMappingEntry {
  return entry.identities.includes(identity)
    ? entry
    : { ...entry, identities: [...entry.identities, identity] };
}

function withIdentityRemoved(entry: PersonMappingEntry, identity: string): PersonMappingEntry {
  return { ...entry, identities: entry.identities.filter((raw) => raw !== identity) };
}

/** Reads and writes only this machine's own user profile, the same guarantee
 * `PersonIdentityAdapter` gives its own file - see `mappingFilePath` for why. */
export class PersonMappingAdapter implements PersonMappingStore {
  get filePath(): string {
    return mappingFilePath();
  }

  async read(): Promise<PersonMapping | null> {
    try {
      const mapping = parsePersonMapping(await readFile(mappingFilePath(), "utf8"));
      validatePersonMapping(mapping);
      return mapping;
    } catch {
      return null;
    }
  }

  async readStrict(): Promise<PersonMapping | null> {
    const raw = await this.readFileOrNull();
    if (raw === null) return null;
    let mapping: PersonMapping;
    try {
      mapping = parsePersonMapping(raw);
    } catch (error) {
      throw new UnreadablePersonMappingFileError(mappingFilePath(), describeError(error));
    }
    validatePersonMapping(mapping);
    return mapping;
  }

  async link(personId: string, identity: string): Promise<PersonMapping> {
    const current = (await this.readStrict()) ?? { entries: [] };
    const index = findEntryIndex(current, personId);
    const entry: PersonMappingEntry =
      index === -1 ? { personId, identities: [identity] } : current.entries[index];
    const updatedEntry = index === -1 ? entry : withIdentityAdded(entry, identity);
    const entries =
      index === -1
        ? [...current.entries, updatedEntry]
        : current.entries.map((existing, i) => (i === index ? updatedEntry : existing));
    const next: PersonMapping = { entries };
    validatePersonMapping(next);
    await this.write(next);
    return next;
  }

  async unlink(identity: string): Promise<PersonMapping> {
    const current = (await this.readStrict()) ?? { entries: [] };
    const index = current.entries.findIndex((entry) => entry.identities.includes(identity));
    if (index === -1) return current;
    const updatedEntry = withIdentityRemoved(current.entries[index], identity);
    const entries = current.entries.map((existing, i) => (i === index ? updatedEntry : existing));
    const next: PersonMapping = { entries };
    await this.write(next);
    return next;
  }

  private async readFileOrNull(): Promise<string | null> {
    try {
      return await readFile(mappingFilePath(), "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return null;
      throw new UnreadablePersonMappingFileError(mappingFilePath(), describeError(error));
    }
  }

  private async write(mapping: PersonMapping): Promise<void> {
    const filePath = mappingFilePath();
    try {
      await mkdir(dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE });
      await writeFile(filePath, serializePersonMapping(mapping), { mode: PRIVATE_FILE_MODE });
    } catch (error) {
      throw new PersonMappingWriteError(filePath, error);
    }
  }
}
