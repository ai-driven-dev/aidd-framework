import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PersonIdentityAdapter } from "../../../../src/contexts/telemetry/infrastructure/person-identity-adapter.js";

/**
 * `PersonIdentityAdapter` on real disk.
 *
 * The first block is the guarantee "the deletion path" review found broken: `filePath` is
 * resolved once, at construction, and `forget(path)` acts on the exact `path` it is handed,
 * never re-resolving `HOME` at removal time.
 *
 * The second block exists because this file used to claim the rest was "already covered
 * indirectly through `PersonIdentityUseCase`'s own tests". It was not: those construct an
 * `InMemoryPersonIdentityStore`, so nothing exercised what this adapter actually writes to
 * disk or reads back — which is what decides whose records are whose. Every write here goes
 * through the file and is read back through it.
 */
describe("PersonIdentityAdapter.forget — resolved once, acts on the path it is handed", () => {
  let previousHome: string | undefined;
  const homes: string[] = [];

  beforeEach(() => {
    previousHome = process.env.HOME;
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
  });

  async function freshHome(): Promise<string> {
    const home = await mkdtemp(join(tmpdir(), "aidd-identity-adapter-"));
    homes.push(home);
    return home;
  }

  it("removes the identity file it was constructed against", async () => {
    const home = await freshHome();
    process.env.HOME = home;
    const adapter = new PersonIdentityAdapter();
    await adapter.mint();

    const wasThere = await adapter.forget(adapter.filePath);

    expect(wasThere).toBe(true);
    await expect(readFile(adapter.filePath, "utf8")).rejects.toThrow();
  });

  it("is a no-op, not a failure, when the path is already gone", async () => {
    const home = await freshHome();
    process.env.HOME = home;
    const adapter = new PersonIdentityAdapter();

    await expect(adapter.forget(adapter.filePath)).resolves.toBe(false);
  });

  // Finding 1: `HOME` relocated between the moment a person is shown `filePath` (the
  // preview) and the moment `forget` runs (the removal) used to reach the relocated
  // profile instead of the one shown, because the old `identityFilePath()` re-read `HOME`
  // on every call. `filePath` is now frozen at construction, and this proves `forget`
  // never asks `HOME` again either — it acts on whatever `path` it is handed.
  it("acts on the path it is handed, immune to HOME being relocated afterwards", async () => {
    const realHome = await freshHome();
    process.env.HOME = realHome;
    const adapter = new PersonIdentityAdapter();
    await adapter.mint();
    const shownPath = adapter.filePath; // what a preview would have shown

    const elsewhereHome = await freshHome();
    await mkdir(join(elsewhereHome, ".config", "aidd"), { recursive: true });
    const victimPath = join(elsewhereHome, ".config", "aidd", "identity.json");
    await writeFile(victimPath, '{"person_id":"victim"}\n');

    process.env.HOME = elsewhereHome; // relocated AFTER the path was shown

    await adapter.forget(shownPath);

    await expect(readFile(shownPath, "utf8")).rejects.toThrow();
    expect(await readFile(victimPath, "utf8")).toContain("victim");
  });
});

describe("PersonIdentityAdapter — what it writes, and what it reads back", () => {
  let previousHome: string | undefined;
  const homes: string[] = [];

  beforeEach(() => {
    previousHome = process.env.HOME;
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
  });

  /** A throwaway profile, with the adapter constructed against it — `filePath` is frozen at
   * construction, so the home has to be in place first. */
  async function adapterInFreshHome(): Promise<PersonIdentityAdapter> {
    const home = await mkdtemp(join(tmpdir(), "aidd-identity-rw-"));
    homes.push(home);
    process.env.HOME = home;
    await mkdir(join(home, ".config", "aidd"), { recursive: true });
    return new PersonIdentityAdapter();
  }

  it("reads back nothing at all before anyone has chosen", async () => {
    const adapter = await adapterInFreshHome();

    expect(await adapter.read()).toBeNull();
    expect(await adapter.readStrict()).toBeNull();
  });

  it("mints an identifier that survives a read back through the file", async () => {
    const adapter = await adapterInFreshHome();

    const minted = await adapter.mint();

    expect(minted.origin).toBe("minted");
    expect(minted.personId).not.toBe("");
    expect(await adapter.readStrict()).toEqual(minted);
  });

  // The distinction `origin` exists for: an identifier this machine created is not the same
  // fact as one carried here from another machine.
  it("records an adopted identifier as adopted, not as minted", async () => {
    const adapter = await adapterInFreshHome();
    await adapter.mint();

    const adopted = await adapter.adopt("person-from-another-machine");

    expect(adopted).toMatchObject({ personId: "person-from-another-machine", origin: "adopted" });
    expect(await adapter.readStrict()).toEqual(adopted);
  });

  it("keeps a display name across a later write", async () => {
    const adapter = await adapterInFreshHome();
    const minted = await adapter.mint();

    await adapter.setDisplayName(minted, "Ada");
    const linked = await adapter.addAlsoMe("machine-2");

    expect(linked.displayName).toBe("Ada");
    expect(await adapter.readStrict()).toEqual(linked);
  });

  it("adds and withdraws an added identifier, leaving the person's own untouched", async () => {
    const adapter = await adapterInFreshHome();
    const minted = await adapter.mint();

    await adapter.addAlsoMe("machine-2");
    await adapter.addAlsoMe("machine-3");
    const after = await adapter.removeAlsoMe("machine-2");

    expect(after.personId).toBe(minted.personId);
    expect(after.alsoMe).toEqual(["machine-3"]);
    expect(await adapter.readStrict()).toEqual(after);
  });

  // `withAlsoMeAdded`'s rule, held on the real file: a person's own identifier is not an
  // identifier added onto them.
  it("refuses to list the person's own identifier among the ones added onto them", async () => {
    const adapter = await adapterInFreshHome();
    const minted = await adapter.mint();

    const after = await adapter.addAlsoMe(minted.personId);

    expect(after.alsoMe).toEqual([]);
  });

  // The whole reason two reads exist: `read` is for every consumer that must not fail over
  // one damaged file, `readStrict` is for the one caller that has to tell "nobody chose"
  // apart from "could not be read".
  it("reads a damaged file as nothing, and refuses it strictly", async () => {
    const adapter = await adapterInFreshHome();
    await writeFile(adapter.filePath, "{ not json");

    expect(await adapter.read()).toBeNull();
    await expect(adapter.readStrict()).rejects.toThrow(/identity/iu);
  });

  it("refuses to add an identifier when nobody has chosen one to add it onto", async () => {
    const adapter = await adapterInFreshHome();

    await expect(adapter.addAlsoMe("machine-2")).rejects.toThrow();
  });

  it("writes a file a person can open and correct by hand", async () => {
    const adapter = await adapterInFreshHome();
    const minted = await adapter.mint();

    const raw = await readFile(adapter.filePath, "utf8");

    expect(JSON.parse(raw)).toMatchObject({ person_id: minted.personId, origin: "minted" });
    expect(raw.endsWith("\n")).toBe(true);
  });
});
