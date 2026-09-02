import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRAMEWORK_REPO,
  MarketplaceSourceMode,
} from "../../../../src/contexts/distribution/domain/marketplace-source-mode.js";

describe("MarketplaceSourceMode", () => {
  describe("remote()", () => {
    it("defaults to DEFAULT_FRAMEWORK_REPO when no repo given", () => {
      const mode = MarketplaceSourceMode.remote();
      expect(mode.kind).toBe("remote");
      expect(mode.repo).toBe(DEFAULT_FRAMEWORK_REPO);
      expect(mode.ref).toBeUndefined();
    });

    it("stores provided repo", () => {
      const mode = MarketplaceSourceMode.remote("owner/custom-repo");
      expect(mode.repo).toBe("owner/custom-repo");
    });

    it("stores provided ref", () => {
      const mode = MarketplaceSourceMode.remote(undefined, "v1.2.3");
      expect(mode.ref).toBe("v1.2.3");
      expect(mode.repo).toBe(DEFAULT_FRAMEWORK_REPO);
    });

    it("stores both repo and ref", () => {
      const mode = MarketplaceSourceMode.remote("owner/repo", "v2.0.0");
      expect(mode.repo).toBe("owner/repo");
      expect(mode.ref).toBe("v2.0.0");
    });

    it("ref is undefined when not provided", () => {
      const mode = MarketplaceSourceMode.remote("owner/repo");
      expect(mode.ref).toBeUndefined();
    });
  });

  describe("local()", () => {
    it("stores absolute path", () => {
      const mode = MarketplaceSourceMode.local("/some/path");
      expect(mode.kind).toBe("local");
      expect(mode.path).toBe("/some/path");
    });

    it("stores relative path as-is (resolution happens at command boundary)", () => {
      const mode = MarketplaceSourceMode.local("./relative/path");
      expect(mode.kind).toBe("local");
      expect(mode.path).toBe("./relative/path");
    });

    it("throws when path is empty", () => {
      expect(() => MarketplaceSourceMode.local("")).toThrow("not be empty");
    });

    it("ref getter returns undefined for local source", () => {
      const mode = MarketplaceSourceMode.local("/some/path");
      expect(mode.ref).toBeUndefined();
    });
  });

  describe("equals()", () => {
    it("two remote sources with same repo and no ref are equal", () => {
      const a = MarketplaceSourceMode.remote("owner/repo");
      const b = MarketplaceSourceMode.remote("owner/repo");
      expect(a.equals(b)).toBe(true);
    });

    it("two remote sources with same repo and same ref are equal", () => {
      const a = MarketplaceSourceMode.remote("owner/repo", "v1.0.0");
      const b = MarketplaceSourceMode.remote("owner/repo", "v1.0.0");
      expect(a.equals(b)).toBe(true);
    });

    it("two remote sources with same repo but different refs are not equal", () => {
      const a = MarketplaceSourceMode.remote("owner/repo", "v1.0.0");
      const b = MarketplaceSourceMode.remote("owner/repo", "v2.0.0");
      expect(a.equals(b)).toBe(false);
    });

    it("remote with ref vs remote without ref are not equal", () => {
      const a = MarketplaceSourceMode.remote("owner/repo", "v1.0.0");
      const b = MarketplaceSourceMode.remote("owner/repo");
      expect(a.equals(b)).toBe(false);
    });

    it("two remote sources with different repos are not equal", () => {
      const a = MarketplaceSourceMode.remote("owner/repo-a");
      const b = MarketplaceSourceMode.remote("owner/repo-b");
      expect(a.equals(b)).toBe(false);
    });

    it("two local sources with same path are equal", () => {
      const a = MarketplaceSourceMode.local("/same/path");
      const b = MarketplaceSourceMode.local("/same/path");
      expect(a.equals(b)).toBe(true);
    });

    it("local vs remote are not equal", () => {
      const a = MarketplaceSourceMode.local("/some/path");
      const b = MarketplaceSourceMode.remote();
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("repo getter on local source", () => {
    it("throws when calling repo on local source", () => {
      const mode = MarketplaceSourceMode.local("/some/path");
      expect(() => mode.repo).toThrow("Not a remote source");
    });
  });

  describe("path getter on remote source", () => {
    it("throws when calling path on remote source", () => {
      const mode = MarketplaceSourceMode.remote();
      expect(() => mode.path).toThrow("Not a local source");
    });
  });
});
