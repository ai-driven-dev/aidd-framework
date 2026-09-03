import { describe, expect, it } from "vitest";
import { InvalidPluginSourceError } from "../../src/kernel/errors.js";
import {
  describePluginSource,
  parsePluginSource,
  parsePluginSourceShorthand,
  serializePluginSource,
} from "../../src/kernel/source.js";

describe("parsePluginSource", () => {
  describe("github kind", () => {
    it("round-trips a minimal github source", () => {
      const raw = { kind: "github", repo: "owner/repo" };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("round-trips a github source with ref and sha", () => {
      const raw = { kind: "github", repo: "owner/repo", ref: "main", sha: "a".repeat(40) };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("throws when repo is missing", () => {
      expect(() => parsePluginSource({ kind: "github" })).toThrow(InvalidPluginSourceError);
    });

    it("throws when repo format is invalid", () => {
      expect(() => parsePluginSource({ kind: "github", repo: "not-valid" })).toThrow(
        InvalidPluginSourceError
      );
    });
  });

  describe("url kind", () => {
    it("round-trips a url source", () => {
      const raw = { kind: "url", url: "https://example.com/plugin.zip" };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("round-trips a url source with optional fields", () => {
      const raw = {
        kind: "url",
        url: "https://example.com/plugin.zip",
        ref: "v1",
        sha: "b".repeat(40),
      };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("throws when url is missing", () => {
      expect(() => parsePluginSource({ kind: "url" })).toThrow(InvalidPluginSourceError);
    });
  });

  describe("git-subdir kind", () => {
    it("round-trips a git-subdir source", () => {
      const raw = {
        kind: "git-subdir",
        url: "https://github.com/org/repo.git",
        path: "plugins/my-plugin",
      };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("keeps the ref and the sha through a round trip", () => {
      // `resolvePluginSourceFromMarketplace` builds this shape with the marketplace's own
      // ref, and `InstalledPlugin.create` serializes then re-parses it in memory — never
      // through JSON. A guard that stops copying `ref` here unpins the plugin silently:
      // the default branch is installed where a version was asked for.
      const raw = {
        kind: "git-subdir",
        url: "https://github.com/org/repo.git",
        path: "plugins/my-plugin",
        ref: "v1.2.0",
        sha: "b".repeat(40),
      };
      expect(serializePluginSource(parsePluginSource(raw))).toStrictEqual(raw);
    });

    it("throws when url is missing", () => {
      expect(() => parsePluginSource({ kind: "git-subdir", path: "sub" })).toThrow(
        InvalidPluginSourceError
      );
    });

    it("throws when path is missing", () => {
      expect(() => parsePluginSource({ kind: "git-subdir", url: "https://example.com" })).toThrow(
        InvalidPluginSourceError
      );
    });
  });

  describe("npm kind", () => {
    it("round-trips a minimal npm source", () => {
      const raw = { kind: "npm", package: "@my-org/my-plugin" };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("round-trips an npm source with version and registry", () => {
      const raw = {
        kind: "npm",
        package: "@my-org/my-plugin",
        version: "1.2.3",
        registry: "https://registry.npmjs.org",
      };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("throws when package is missing", () => {
      expect(() => parsePluginSource({ kind: "npm" })).toThrow(InvalidPluginSourceError);
    });

    describe("npm name security validation", () => {
      it("accepts a valid unscoped package name", () => {
        expect(() => parsePluginSource({ kind: "npm", package: "my-plugin" })).not.toThrow();
      });

      it("accepts a valid scoped package name", () => {
        expect(() =>
          parsePluginSource({ kind: "npm", package: "@my-org/my-plugin" })
        ).not.toThrow();
      });

      it("rejects a package name starting with a dash (injection vector)", () => {
        expect(() => parsePluginSource({ kind: "npm", package: "-x" })).toThrow(
          InvalidPluginSourceError
        );
      });

      it("rejects a package name starting with double-dash (option injection)", () => {
        expect(() =>
          parsePluginSource({ kind: "npm", package: "--registry=https://evil.com" })
        ).toThrow(InvalidPluginSourceError);
      });

      it("rejects a package name starting with a dot", () => {
        expect(() => parsePluginSource({ kind: "npm", package: ".my-plugin" })).toThrow(
          InvalidPluginSourceError
        );
      });

      it("rejects a package name with uppercase letters", () => {
        expect(() => parsePluginSource({ kind: "npm", package: "My-Plugin" })).toThrow(
          InvalidPluginSourceError
        );
      });
    });
  });

  describe("local kind", () => {
    it("round-trips a local source", () => {
      const raw = { kind: "local", path: "./plugins/my-plugin" };
      const src = parsePluginSource(raw);
      expect(serializePluginSource(src)).toEqual(raw);
    });

    it("throws when path is missing", () => {
      expect(() => parsePluginSource({ kind: "local" })).toThrow(InvalidPluginSourceError);
    });
  });

  describe("a source recorded as a plain string", () => {
    // A manifest may record a source as a string rather than an object. Read wrong, the
    // plugin is fetched from the wrong place — or a valid record is refused on load.
    it("reads a bare owner/repo as a github source", () => {
      expect(parsePluginSource("ai-driven-dev/framework")).toEqual({
        kind: "github",
        repo: "ai-driven-dev/framework",
      });
    });

    it("reads a relative path as a local source", () => {
      expect(parsePluginSource("./plugins/mine")).toEqual({
        kind: "local",
        path: "./plugins/mine",
      });
    });

    it("reads an absolute path as a local source", () => {
      expect(parsePluginSource("/opt/plugins/mine")).toEqual({
        kind: "local",
        path: "/opt/plugins/mine",
      });
    });
  });

  describe("a field that is present but empty", () => {
    it("refuses an empty path rather than recording a source pointing nowhere", () => {
      expect(() => parsePluginSource({ kind: "local", path: "" })).toThrow(
        /"path" must be a non-empty string/
      );
    });
  });

  describe("invalid inputs", () => {
    it("throws for unknown kind", () => {
      expect(() => parsePluginSource({ kind: "svn", url: "svn://example.com" })).toThrow(
        InvalidPluginSourceError
      );
    });

    it("throws for null", () => {
      expect(() => parsePluginSource(null)).toThrow(InvalidPluginSourceError);
    });

    it("throws for array", () => {
      expect(() => parsePluginSource([])).toThrow(InvalidPluginSourceError);
    });

    it("throws for primitive string", () => {
      expect(() => parsePluginSource("github:owner/repo")).toThrow(InvalidPluginSourceError);
    });

    it("throws when kind is missing", () => {
      expect(() => parsePluginSource({ repo: "owner/repo" })).toThrow(InvalidPluginSourceError);
    });
  });
});

/**
 * The spellings `aidd plugin add <source>` accepts.
 *
 * Grouped by what a user types rather than by the function that parses it: choosing the
 * wrong kind sends the plugin to the wrong fetch adapter, and dropping a ref installs the
 * default branch where a pinned version was asked for — both silently.
 */
describe("the source spellings a user types", () => {
  describe("a bare owner/repo", () => {
    it("resolves to a github source with no ref", () => {
      expect(parsePluginSourceShorthand("ai-driven-dev/framework")).toEqual({
        kind: "github",
        repo: "ai-driven-dev/framework",
      });
    });

    it("is not mistaken for a path when it contains dots or dashes", () => {
      expect(parsePluginSourceShorthand("my-org/my.plugin_v2")).toEqual({
        kind: "github",
        repo: "my-org/my.plugin_v2",
      });
    });
  });

  describe("a pinned version, owner/repo@ref", () => {
    it("keeps the ref and strips it from the repo", () => {
      expect(parsePluginSourceShorthand("ai-driven-dev/framework@v1.2.0")).toEqual({
        kind: "github",
        repo: "ai-driven-dev/framework",
        ref: "v1.2.0",
      });
    });

    it("splits on the last @, so a ref containing one is refused rather than mangled", () => {
      // The repo half would be "owner/repo@release", which is not owner/repo, so the
      // spelling falls through to the JSON branch and is rejected. Better than installing
      // a repo whose name silently carries an @.
      expect(() => parsePluginSourceShorthand("owner/repo@release@2")).toThrow(
        InvalidPluginSourceError
      );
    });

    it("refuses a spelling whose repo half is not owner/repo", () => {
      expect(() => parsePluginSourceShorthand("not-a-repo@v1")).toThrow(InvalidPluginSourceError);
    });

    it("treats a leading @ as part of an unrecognized spelling, not a separator", () => {
      expect(() => parsePluginSourceShorthand("@v1.2.0")).toThrow(InvalidPluginSourceError);
    });
  });

  describe("a gitlab: shorthand", () => {
    it("resolves gitlab:owner/repo to a gitlab.com git URL", () => {
      expect(parsePluginSourceShorthand("gitlab:my-org/my-plugin")).toEqual({
        kind: "url",
        url: "https://gitlab.com/my-org/my-plugin.git",
      });
    });

    it("carries a ref through when one is given", () => {
      expect(parsePluginSourceShorthand("gitlab:my-org/my-plugin@v2")).toEqual({
        kind: "url",
        url: "https://gitlab.com/my-org/my-plugin.git",
        ref: "v2",
      });
    });

    it("says what the spelling should have looked like when it is malformed", () => {
      expect(() => parsePluginSourceShorthand("gitlab:nope")).toThrow(
        /gitlab:owner\/repo or gitlab:owner\/repo@ref/
      );
    });
  });

  describe("a URL", () => {
    it("keeps an https URL as a url source", () => {
      expect(parsePluginSourceShorthand("https://example.com/p.git")).toEqual({
        kind: "url",
        url: "https://example.com/p.git",
      });
    });

    it("keeps an http URL as a url source", () => {
      expect(parsePluginSourceShorthand("http://example.com/p.git")).toEqual({
        kind: "url",
        url: "http://example.com/p.git",
      });
    });

    it("keeps an SSH URL as a url source", () => {
      expect(parsePluginSourceShorthand("git@github.com:owner/repo.git")).toEqual({
        kind: "url",
        url: "git@github.com:owner/repo.git",
      });
    });
  });

  describe("a path on this machine", () => {
    it("resolves a relative path to a local source", () => {
      expect(parsePluginSourceShorthand("./plugins/mine")).toEqual({
        kind: "local",
        path: "./plugins/mine",
      });
    });

    it("resolves an absolute path to a local source", () => {
      expect(parsePluginSourceShorthand("/opt/plugins/mine")).toEqual({
        kind: "local",
        path: "/opt/plugins/mine",
      });
    });
  });

  describe("raw JSON, for the sources no shorthand covers", () => {
    it("parses a JSON object into the source it describes", () => {
      expect(
        parsePluginSourceShorthand('{"kind":"npm","package":"@scope/pkg","version":"1.0.0"}')
      ).toEqual({ kind: "npm", package: "@scope/pkg", version: "1.0.0" });
    });

    it("reports the JSON's own complaint when the object is a bad source", () => {
      // Not just the error class: both branches throw InvalidPluginSourceError, so
      // asserting the class alone would pass even if the parser's own message were
      // swallowed and replaced by the generic "unrecognized source format".
      expect(() => parsePluginSourceShorthand('{"kind":"github"}')).toThrow(
        /"repo" must be a non-empty string/
      );
    });

    it("names the string it was given when nothing recognizes it", () => {
      expect(() => parsePluginSourceShorthand("just some words")).toThrow(
        /unrecognized source format: "just some words"/
      );
    });
  });
});

/**
 * What `status` and `doctor` print back for a recorded source. A wrong line here tells the
 * user their project points somewhere it does not.
 */
describe("the source shown back to a user", () => {
  it("shows a github source as its full URL", () => {
    expect(describePluginSource({ kind: "github", repo: "owner/repo" })).toBe(
      "https://github.com/owner/repo"
    );
  });

  it("appends the ref when the source is pinned", () => {
    expect(describePluginSource({ kind: "github", repo: "owner/repo", ref: "v1" })).toBe(
      "https://github.com/owner/repo@v1"
    );
  });

  it("shows a url source as the URL itself", () => {
    expect(describePluginSource({ kind: "url", url: "https://example.com/p.git" })).toBe(
      "https://example.com/p.git"
    );
  });

  it("shows a git-subdir source as the URL and the path it points into", () => {
    expect(
      describePluginSource({ kind: "git-subdir", url: "https://example.com/r.git", path: "pkg/a" })
    ).toBe("https://example.com/r.git#pkg/a");
  });

  it("shows an npm source with its registry prefix", () => {
    expect(describePluginSource({ kind: "npm", package: "@scope/pkg" })).toBe("npm:@scope/pkg");
  });

  it("appends the version when the npm source has one", () => {
    expect(describePluginSource({ kind: "npm", package: "@scope/pkg", version: "2.1.0" })).toBe(
      "npm:@scope/pkg@2.1.0"
    );
  });

  it("shows a local source as the path itself", () => {
    expect(describePluginSource({ kind: "local", path: "./plugins/mine" })).toBe("./plugins/mine");
  });
});

/**
 * A manifest field of the wrong type must be refused, not coerced: a source silently
 * accepted here is a fetch that fails much later, with an error naming the wrong thing.
 */
describe("a manifest field of the wrong type", () => {
  it("refuses a non-string optional field", () => {
    expect(() => parsePluginSource({ kind: "github", repo: "owner/repo", ref: 3 })).toThrow(
      /"ref" must be a string/
    );
  });

  it("accepts the field being absent", () => {
    expect(parsePluginSource({ kind: "github", repo: "owner/repo" })).toEqual({
      kind: "github",
      repo: "owner/repo",
    });
  });

  it("refuses a sha that is not 40 lowercase hex characters", () => {
    expect(() => parsePluginSource({ kind: "github", repo: "owner/repo", sha: "ABC123" })).toThrow(
      /40-character lowercase hex/
    );
  });

  it("accepts a well-formed sha", () => {
    const sha = "a".repeat(40);
    expect(parsePluginSource({ kind: "github", repo: "owner/repo", sha })).toEqual({
      kind: "github",
      repo: "owner/repo",
      sha,
    });
  });

  it("lists the kinds it knows when given one it does not", () => {
    expect(() => parsePluginSource({ kind: "svn" })).toThrow(
      /Expected: github, url, git-subdir, npm, local/
    );
  });
});
