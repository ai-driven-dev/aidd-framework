import { describe, expect, it } from "vitest";
import { AuthStatusUseCase } from "../../../src/runtime/auth/auth-status-use-case.js";
import type {
  AuthStatus,
  CredentialStore,
} from "../../../src/runtime/auth/ports/credential-store.js";

function makeCredentialStore(status: AuthStatus): CredentialStore {
  return {
    login: async () => {
      throw new Error("not called");
    },
    status: async () => status,
    logout: async () => {
      throw new Error("not called");
    },
  };
}

describe("auth status", () => {
  it("returns authenticated status when provider resolves a valid login", async () => {
    const useCase = new AuthStatusUseCase(
      makeCredentialStore({ authenticated: true, login: "octocat", level: "user" })
    );
    const result = await useCase.execute();
    expect(result.authenticated).toBe(true);
    if (result.authenticated) {
      expect(result.login).toBe("octocat");
      expect(result.level).toBe("user");
    }
  });

  it("returns unauthenticated status when no credentials stored", async () => {
    const useCase = new AuthStatusUseCase(makeCredentialStore({ authenticated: false }));
    const result = await useCase.execute();
    expect(result.authenticated).toBe(false);
  });
});
