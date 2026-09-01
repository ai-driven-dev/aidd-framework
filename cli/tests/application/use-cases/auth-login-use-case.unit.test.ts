import { describe, expect, it, vi } from "vitest";
import { AuthLoginUseCase } from "../../../src/application/use-cases/auth/auth-login-use-case.js";
import type { AuthCredential, AuthLevel } from "../../../src/domain/models/auth.js";
import type { CredentialStore } from "../../../src/domain/ports/credential-store.js";
import { AuthenticationError } from "../../../src/kernel/errors.js";

describe("auth login", () => {
  function makeCredentialStore(login: string): CredentialStore {
    return {
      login: vi.fn().mockResolvedValue({ login, level: "user" as AuthLevel }),
      status: vi.fn().mockRejectedValue(new Error("not called")),
      logout: vi.fn().mockRejectedValue(new Error("not called")),
    };
  }

  function makeFailingCredentialStore(message: string): CredentialStore {
    return {
      login: vi.fn().mockRejectedValue(new AuthenticationError(message)),
      status: vi.fn().mockRejectedValue(new Error("not called")),
      logout: vi.fn().mockRejectedValue(new Error("not called")),
    };
  }

  it("authenticates with PAT when stored credential is provided at user level", async () => {
    const provider = makeCredentialStore("octocat");
    const credential: AuthCredential = { method: "stored", token: "ghp_abc123" };
    const result = await new AuthLoginUseCase(provider).execute({ credential, level: "user" });

    expect(result.login).toBe("octocat");
    expect(result.level).toBe("user");
    expect(provider.login).toHaveBeenCalledWith(credential, "user");
  });

  it("authenticates with external credential at project level", async () => {
    const provider = makeCredentialStore("octocat");
    const credential: AuthCredential = { method: "external", provider: "gh" };
    await new AuthLoginUseCase(provider).execute({ credential, level: "project" });

    expect(provider.login).toHaveBeenCalledWith(credential, "project");
  });

  it("propagates error when provider fails", async () => {
    const credential: AuthCredential = { method: "external", provider: "gh" };
    await expect(
      new AuthLoginUseCase(makeFailingCredentialStore("gh CLI")).execute({
        credential,
        level: "user",
      })
    ).rejects.toThrow(/Authentication failed/);
  });

  it("fails when stored credential has invalid token (HTTP 401)", async () => {
    const credential: AuthCredential = { method: "stored", token: "bad-token" };
    await expect(
      new AuthLoginUseCase(makeFailingCredentialStore("HTTP 401")).execute({
        credential,
        level: "user",
      })
    ).rejects.toThrow(/Authentication failed/);
  });
});
