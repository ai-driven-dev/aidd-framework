import { describe, expect, it } from "vitest";
import { AuthenticationError } from "../../../src/kernel/errors.js";
import type { AuthConfig } from "../../../src/runtime/auth/auth.js";
import { AuthProviderAdapter } from "../../../src/runtime/auth/auth-provider-adapter.js";
import type {
  CredentialFileSaveOptions,
  CredentialFileStore,
} from "../../../src/runtime/auth/ports/credential-file-store.js";
import type {
  CliAuthProvider,
  TokenAuthProvider,
} from "../../../src/runtime/auth/ports/oauth-provider.js";

const PROJECT_ROOT = "/work/project";

type Saved = CredentialFileSaveOptions;

function storage(active: AuthConfig | null = null): CredentialFileStore & { saves: Saved[] } {
  const saves: Saved[] = [];
  return {
    saves,
    save: async (options) => {
      saves.push(options);
    },
    readActive: async () => active,
    read: async () => null,
    delete: async () => {},
    projectConfigPath: () => `${PROJECT_ROOT}/.aidd/auth.json`,
    userConfigPath: () => "/home/user/.config/aidd/auth.json",
  };
}

function tokenVerifier(login = "token-user"): TokenAuthProvider & { seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    verifyToken: async (token: string) => {
      seen.push(token);
      return login;
    },
  };
}

function cliProvider(login: string): CliAuthProvider {
  return { resolve: () => null, verify: async () => login };
}

describe("the credential a user hands the CLI", () => {
  describe("logging in with a stored token", () => {
    it("verifies the token it was given, not another", async () => {
      const verifier = tokenVerifier("octocat");
      const adapter = new AuthProviderAdapter(storage(), new Map(), verifier, PROJECT_ROOT);

      const result = await adapter.login({ method: "stored", token: "ghp_secret" }, "project");

      expect(verifier.seen).toEqual(["ghp_secret"]);
      expect(result).toEqual({ login: "octocat", level: "project" });
    });

    it("records the credential at the level asked for, against this project", async () => {
      const store = storage();
      const adapter = new AuthProviderAdapter(store, new Map(), tokenVerifier(), PROJECT_ROOT);

      await adapter.login({ method: "stored", token: "ghp_secret" }, "user");

      expect(store.saves).toEqual([
        {
          credential: { method: "stored", token: "ghp_secret" },
          level: "user",
          projectRoot: PROJECT_ROOT,
        },
      ]);
    });
  });

  describe("logging in through an external provider", () => {
    it("asks the named provider, and returns the login it reports", async () => {
      const providers = new Map([
        ["gh", cliProvider("from-gh")],
        ["glab", cliProvider("from-glab")],
      ]);
      const adapter = new AuthProviderAdapter(
        storage(),
        providers,
        tokenVerifier("never-used"),
        PROJECT_ROOT
      );

      const result = await adapter.login({ method: "external", provider: "glab" }, "user");

      expect(result.login, "the provider named in the credential answers").toBe("from-glab");
    });

    it("names the provider it could not find, so the user can fix the spelling", async () => {
      const adapter = new AuthProviderAdapter(
        storage(),
        new Map([["gh", cliProvider("from-gh")]]),
        tokenVerifier(),
        PROJECT_ROOT
      );

      await expect(adapter.login({ method: "external", provider: "hub" }, "user")).rejects.toThrow(
        /hub/
      );
    });
  });
});

describe("what `auth status` reports", () => {
  describe("with nothing recorded", () => {
    it("says not authenticated, and verifies nothing", async () => {
      const verifier = tokenVerifier();
      const adapter = new AuthProviderAdapter(storage(null), new Map(), verifier, PROJECT_ROOT);

      expect(await adapter.status()).toEqual({ authenticated: false });
      expect(verifier.seen, "no credential means no verification call").toEqual([]);
    });
  });

  describe("with a stored token recorded", () => {
    const config: AuthConfig = {
      version: 1,
      method: "stored",
      level: "project",
      token: "ghp_stored",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    it("verifies the recorded token and reports the recorded level", async () => {
      const verifier = tokenVerifier("octocat");
      const adapter = new AuthProviderAdapter(storage(config), new Map(), verifier, PROJECT_ROOT);

      expect(await adapter.status()).toEqual({
        authenticated: true,
        login: "octocat",
        level: "project",
      });
      expect(verifier.seen).toEqual(["ghp_stored"]);
    });

    it("refuses a record that claims a token and carries none", async () => {
      const adapter = new AuthProviderAdapter(
        storage({ ...config, token: undefined }),
        new Map(),
        tokenVerifier(),
        PROJECT_ROOT
      );

      await expect(adapter.status()).rejects.toThrow(AuthenticationError);
    });
  });

  describe("with an external record", () => {
    const external: AuthConfig = {
      version: 1,
      method: "external",
      level: "user",
      provider: "glab",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    it("asks the provider the record names", async () => {
      const adapter = new AuthProviderAdapter(
        storage(external),
        new Map([
          ["gh", cliProvider("from-gh")],
          ["glab", cliProvider("from-glab")],
        ]),
        tokenVerifier(),
        PROJECT_ROOT
      );

      expect(await adapter.status()).toEqual({
        authenticated: true,
        login: "from-glab",
        level: "user",
      });
    });

    it("falls back to gh when the record names no provider", async () => {
      const adapter = new AuthProviderAdapter(
        storage({ ...external, provider: undefined }),
        new Map([
          ["gh", cliProvider("from-gh")],
          ["glab", cliProvider("from-glab")],
        ]),
        tokenVerifier(),
        PROJECT_ROOT
      );

      const status = await adapter.status();

      expect(status, "a record written before providers were named still resolves").toEqual({
        authenticated: true,
        login: "from-gh",
        level: "user",
      });
    });
  });
});
