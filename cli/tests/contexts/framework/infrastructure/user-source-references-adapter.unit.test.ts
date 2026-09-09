import { describe, expect, it } from "vitest";
import { UserSourceReferencesAdapter } from "../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import { UnreadableUserSourceReferencesError } from "../../../../src/kernel/errors.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

const USER_CONFIG_DIR = "/fake-home/.config/aidd";
const REFERENCES_PATH = `${USER_CONFIG_DIR}/references.json`;

function adapter(fs: InMemoryFileAdapter = new InMemoryFileAdapter()): UserSourceReferencesAdapter {
  return new UserSourceReferencesAdapter(fs, () => USER_CONFIG_DIR);
}

/** Marks `root` as an existing project directory, the way a real one always has at least
 * `.aidd/manifest.json`; a bare path with no children reads as "gone" to `fileExists`. */
function markExisting(fs: InMemoryFileAdapter, root: string): void {
  fs.setFile(`${root}/marker`, "");
}

describe("the shared source's own project references", () => {
  it("adds two projects under the same version", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    markExisting(fs, "/project-b");
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/project-a");
    await refs.addReference("1.0.0", "/project-b");

    const written = JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}") as Record<string, string[]>;
    expect(written["1.0.0"]).toEqual(["/project-a", "/project-b"]);
  });

  it("adding the same project twice changes nothing", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/project-a");
    await refs.addReference("1.0.0", "/project-a");

    const written = JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}") as Record<string, string[]>;
    expect(written).toEqual({ "1.0.0": ["/project-a"] });
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
    expect(written["1.0.0"]).toEqual(["/project-a"]);
    expect(written["2.0.0"]).toEqual(["/project-b"]);
  });

  // A help, not an authority: a project a person deleted with `rm -rf` decrements
  // nothing, so it must never be counted as still live either.
  it("ignores a reference whose own projectRoot no longer exists", async () => {
    const fs = new InMemoryFileAdapter();
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/gone");

    expect(await refs.listAllReferencingProjects()).toEqual([]);
  });

  // A help, not an authority, all the way to the file: a vanished project's entry is ignored at
  // read but survives until the next write, so every read keeps `stat`-ing a dead path.
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

  // Nothing here asks which version is "current", only where the project is recorded, so a CLI
  // self-update between the `sync` that wrote the reference and this read cannot strand it.
  it("re-adding a project already recorded under its version leaves the file untouched, even a vanished neighbour", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    markExisting(fs, "/project-b");
    const refs = adapter(fs);
    await refs.addReference("1.0.0", "/project-a");
    await refs.addReference("1.0.0", "/project-b");
    await fs.deleteFile("/project-b/marker");

    await refs.addReference("1.0.0", "/project-a");

    expect(JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}")).toStrictEqual({
      "1.0.0": ["/project-a", "/project-b"],
    });
  });

  it("a project recorded under two versions ends up recorded once, under the version asked", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    markExisting(fs, "/project-z");
    fs.setFile(
      REFERENCES_PATH,
      JSON.stringify({ "1.0.0": ["/project-a"], "2.0.0": ["/project-a", "/project-z"] })
    );
    const refs = adapter(fs);

    await refs.addReference("1.0.0", "/project-a");

    expect(JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}")).toStrictEqual({
      "1.0.0": ["/project-a"],
      "2.0.0": ["/project-z"],
    });
  });

  it("a version whose every project vanished disappears from the file at the next write", async () => {
    const fs = new InMemoryFileAdapter();
    markExisting(fs, "/project-a");
    const refs = adapter(fs);
    await refs.addReference("1.0.0", "/project-a");
    await fs.deleteFile("/project-a/marker");
    markExisting(fs, "/project-b");

    await refs.addReference("2.0.0", "/project-b");

    expect(JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}")).toStrictEqual({
      "2.0.0": ["/project-b"],
    });
  });

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
    it("drops this project's own claim, wherever it is recorded, leaving every other one", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      markExisting(fs, "/project-b");
      const refs = adapter(fs);
      // Recorded while the CLI was at 1.0.0 — never re-synced since, the ordinary case
      // an `aidd update` in between produces.
      await refs.addReference("1.0.0", "/project-a");
      await refs.addReference("1.0.0", "/project-b");

      await refs.removeReference("/project-a");

      const written = JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}") as Record<string, string[]>;
      expect(written["1.0.0"]).toEqual(["/project-b"]);
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

    it("drops a claim recorded under a later version, leaving the earlier version's projects", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      markExisting(fs, "/project-b");
      const refs = adapter(fs);
      await refs.addReference("1.0.0", "/project-a");
      await refs.addReference("2.0.0", "/project-b");

      await refs.removeReference("/project-b");

      expect(JSON.parse(fs.getFile(REFERENCES_PATH) ?? "{}")).toStrictEqual({
        "1.0.0": ["/project-a"],
      });
    });

    it("does nothing when this project never held a reference", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      const refs = adapter(fs);

      await expect(refs.removeReference("/project-a")).resolves.toBeUndefined();
      // Never found a claim to drop, so it never had a reason to write at all —
      // the file this project's own `setup` or `sync` never ran stays absent.
      expect(fs.getFile(REFERENCES_PATH)).toBeUndefined();
    });
  });

  it("throws rather than silently treating a corrupted file as empty", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(REFERENCES_PATH, "not json");
    const refs = adapter(fs);

    await expect(refs.listAllReferencingProjects()).rejects.toThrow(
      UnreadableUserSourceReferencesError
    );
  });

  it("throws when a version's own entry is not a list of project paths", async () => {
    const fs = new InMemoryFileAdapter();
    fs.setFile(REFERENCES_PATH, JSON.stringify({ "1.0.0": "/project-a" }));
    const refs = adapter(fs);

    await expect(refs.listAllReferencingProjects()).rejects.toThrow(
      UnreadableUserSourceReferencesError
    );
  });

  describe("a file it cannot read", () => {
    it("names the parser's own reason for unparsable JSON", async () => {
      const fs = new InMemoryFileAdapter();
      fs.setFile(REFERENCES_PATH, "not json");
      const refs = adapter(fs);

      await expect(refs.listAllReferencingProjects()).rejects.toThrow(
        /registry at \/fake-home\/\.config\/aidd\/references\.json: Unexpected token/
      );
    });

    it.each([
      ["null", "null"],
      ["a list", "[]"],
      ["a string", '"/project-a"'],
    ])("names a top level that is %s rather than a version-keyed object", async (_shape, raw) => {
      const fs = new InMemoryFileAdapter();
      fs.setFile(REFERENCES_PATH, raw);
      const refs = adapter(fs);

      await expect(refs.listAllReferencingProjects()).rejects.toThrow(
        new UnreadableUserSourceReferencesError(REFERENCES_PATH, "it is not a version-keyed object")
      );
    });

    it("names the version whose entry mixes a non-path in", async () => {
      const fs = new InMemoryFileAdapter();
      fs.setFile(REFERENCES_PATH, JSON.stringify({ "1.0.0": ["/project-a", 5] }));
      const refs = adapter(fs);

      await expect(refs.listAllReferencingProjects()).rejects.toThrow(
        new UnreadableUserSourceReferencesError(
          REFERENCES_PATH,
          'its "1.0.0" entry is not a list of project paths'
        )
      );
    });
  });

  describe("listAllReferencingProjects", () => {
    it("lists existing projects across every version key, deduplicated", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      markExisting(fs, "/project-b");
      const refs = adapter(fs);
      await refs.addReference("1.0.0", "/project-a");
      await refs.addReference("2.0.0", "/project-b");

      expect([...(await refs.listAllReferencingProjects())].sort()).toEqual([
        "/project-a",
        "/project-b",
      ]);
    });

    it("leaves out a project whose own root no longer exists", async () => {
      const fs = new InMemoryFileAdapter();
      markExisting(fs, "/project-a");
      const refs = adapter(fs);
      await refs.addReference("1.0.0", "/project-a");
      await refs.addReference("1.0.0", "/gone");

      expect(await refs.listAllReferencingProjects()).toEqual(["/project-a"]);
    });

    it("is empty when the file has never been written", async () => {
      const refs = adapter();

      expect(await refs.listAllReferencingProjects()).toEqual([]);
    });
  });
});
