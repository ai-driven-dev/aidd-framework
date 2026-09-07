import { describe, expect, it } from "vitest";
import { UserSourceReferencesAdapter } from "../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import { UnreadableUserSourceReferencesError } from "../../../../src/kernel/errors.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

const USER_CONFIG_DIR = "/fake-home/.config/aidd";
const REFERENCES_PATH = `${USER_CONFIG_DIR}/references.json`;

function adapter(fs: InMemoryFileAdapter = new InMemoryFileAdapter()): UserSourceReferencesAdapter {
  return new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
}

/** Marks `root` as an existing project directory, the same way a real one always has at
 * least `.aidd/manifest.json` under it — `fileExists` on a bare path with no children
 * would otherwise read as "gone" for every project this suite seeds. */
function markExisting(fs: InMemoryFileAdapter, root: string): void {
  fs.setFile(`${root}/marker`, "");
}

describe("the shared source's own project references", () => {
  it("counts two projects added under the same version", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    markExisting(fs, "/project-b");
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/project-a");
    await refs.addReference("1.0.0", "/project-b");

    expect(await refs.countReferencesForProject("/project-a")).toBe(2);
  });

  it("adding the same project twice changes nothing", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/project-a");
    await refs.addReference("1.0.0", "/project-a");

    expect(await refs.countReferencesForProject("/project-a")).toBe(1);
  });

  it("gives two CLI versions two separate keys", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    markExisting(fs, "/project-b");
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/project-a");
    await refs.addReference("2.0.0", "/project-b");

    const written = JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}") as Record<string, string[]>;
    expect(Object.keys(written).sort()).toEqual(["1.0.0", "2.0.0"]);
    expect(await refs.countReferencesForProject("/project-a")).toBe(1);
    expect(await refs.countReferencesForProject("/project-b")).toBe(1);
  });

  // A help, not an authority: a project a person deleted with `rm -rf` decrements
  // nothing, so it must never be counted as still live either.
  it("ignores a reference whose own projectRoot no longer exists", async () => {
    const fs = new InMemoryFileAdapter();
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/gone");

    expect(await refs.countReferencesForProject("/gone")).toBe(0);
  });

  // A help, not an authority, all the way to the file itself: a vanished project's own
  // entry is ignored at read (above), but until it is also purged at the next write the
  // file never shrinks, so every read keeps `stat`-ing a path nobody will ever revive.
  it("purges a vanished project's own entry from the file at the next write", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    const refs = adapter(fs);
    await refs.addReference("1.0.0", "/project-a");
    // /project-b is never marked existing: the same `rm -rf` situation as the test
    // above, recorded once and then abandoned.
    await refs.addReference("1.0.0", "/project-b");

    // Another project's own `setup` runs later on this machine and adds its claim —
    // the ordinary event that triggers the next write to this file.
    markExisting(fs, "/project-c");
    await refs.addReference("1.0.0", "/project-c");

    const written = JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}") as Record<string, string[]>;
    expect(written["1.0.0"]).toEqual(["/project-a", "/project-c"]);
  });

  // A CLI self-update between the `sync` that wrote the reference and this read must
  // never matter: nothing here asks which version is "current", only where the project
  // itself is recorded — so a stale build number can never strand a reference nobody
  // ever asks about again.
  it("adding the same project under a new version drops its claim on the old one", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    const refs = adapter(fs);
    await refs.addReference("1.0.0", "/project-a");

    await refs.addReference("2.0.0", "/project-a");

    const written = JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}") as Record<string, string[]>;
    expect(written).toEqual({ "2.0.0": ["/project-a"] });
  });

  describe("removeReference", () => {
    it("drops this project's own claim, wherever it is recorded, and reports how many others remain", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      markExisting(fs, "/project-b");
      const refs = adapter(fs);
      // Recorded while the CLI was at 1.0.0 — never re-synced since, the ordinary case
      // an `aidd update` in between produces.
      await refs.addReference("1.0.0", "/project-a");
      await refs.addReference("1.0.0", "/project-b");

      const outcome = await refs.removeReference("/project-a");

      expect(outcome).toEqual({ remainingCount: 1 });
      expect(await refs.countReferencesForProject("/project-b")).toBe(1);
    });

    it("ignores a vanished project when deciding whether this was the last reference", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      // /project-b is never marked existing: it still names a reference, but its own
      // directory is gone, the same as a person having `rm -rf`'d it.
      const refs = adapter(fs);
      await refs.addReference("1.0.0", "/project-a");
      await refs.addReference("1.0.0", "/project-b");

      const outcome = await refs.removeReference("/project-a");

      expect(outcome).toEqual({ remainingCount: 0 });
    });

    it("removes the version key entirely once its last reference is gone", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      const refs = adapter(fs);
      await refs.addReference("1.0.0", "/project-a");

      await refs.removeReference("/project-a");

      const written = JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}") as Record<string, unknown>;
      expect(written).toEqual({});
    });

    it("reports undefined for a project that never held a reference", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      const refs = adapter(fs);

      const outcome = await refs.removeReference("/project-a");

      expect(outcome).toBeUndefined();
    });
  });

  it("throws rather than silently treating a corrupted file as empty", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(REFERENCES_PATH, "not json");
    const refs = adapter(fs);

    await expect(refs.countReferencesForProject("/project-a")).rejects.toThrow(
      UnreadableUserSourceReferencesError
    );
  });

  it("throws when a version's own entry is not a list of project paths", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(REFERENCES_PATH, JSON.stringify({ "1.0.0": "/project-a" }));
    const refs = adapter(fs);

    await expect(refs.countReferencesForProject("/project-a")).rejects.toThrow(
      UnreadableUserSourceReferencesError
    );
  });
});
