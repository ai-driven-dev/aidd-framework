import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PersonIdentityAdapter } from "../../../src/infrastructure/adapters/person-identity-adapter.js";

/**
 * `PersonIdentityAdapter.forget()` on real disk — narrowly scoped to the guarantee "the
 * deletion path" review found broken: `filePath` is resolved once, at construction, and
 * `forget(path)` acts on the exact `path` it is handed, never re-resolving `HOME` at
 * removal time. Everything else about the adapter (`mint`, `adopt`, `addAlsoMe`, …) is
 * already covered indirectly through `PersonIdentityUseCase`'s own tests.
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
