import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthLogoutUseCase } from "../../../src/runtime/auth/auth-logout-use-case.js";
import { AuthProviderAdapter } from "../../../src/runtime/auth/auth-provider-adapter.js";
import type { AuthStorage } from "../../../src/runtime/auth/auth-storage.js";
import { GhCliAdapter } from "../../../src/runtime/auth/gh-cli-adapter.js";
import { GhTokenAdapter } from "../../../src/runtime/auth/gh-token-adapter.js";
import type { CredentialStore } from "../../../src/runtime/auth/ports/credential-store.js";
import { HttpClient } from "../../../src/runtime/http/http-client.js";
import { makeAuthConfig, makeTempAuthStorage } from "../../helpers/auth.js";

describe("auth logout", () => {
  let tempDir: string;
  let storage: AuthStorage;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, storage, cleanup } = await makeTempAuthStorage("auth-logout-test"));
  });

  afterEach(async () => {
    await cleanup();
  });

  function makeProvider(): CredentialStore {
    const http = new HttpClient();
    return new AuthProviderAdapter(
      storage,
      new Map([["gh", new GhCliAdapter()]]),
      new GhTokenAdapter(http),
      tempDir
    );
  }

  it("reports no auth file found when user is not logged in", async () => {
    const useCase = new AuthLogoutUseCase(makeProvider());
    const result = await useCase.execute();
    expect(result.found).toBe(false);
  });

  it("removes project auth.json and returns project level", async () => {
    const config = makeAuthConfig({ level: "project" });
    const path = storage.projectConfigPath(tempDir);
    await storage.write(path, config);

    const useCase = new AuthLogoutUseCase(makeProvider());
    const result = await useCase.execute();

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.level).toBe("project");
      expect(result.hint).toBeUndefined();
    }

    const after = await storage.read(path);
    expect(after).toBeNull();
  });

  it("removes user auth.json when no project config found", async () => {
    await storage.write(storage.userConfigPath(), makeAuthConfig({ token: "ghp_user" }));

    const useCase = new AuthLogoutUseCase(makeProvider());
    const result = await useCase.execute();

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.level).toBe("user");
    }
  });

  it("sets external-provider-cleanup hint when method=external", async () => {
    await storage.write(
      storage.userConfigPath(),
      makeAuthConfig({ method: "external", token: undefined })
    );

    const useCase = new AuthLogoutUseCase(makeProvider());
    const result = await useCase.execute();

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.hint).toBe("external-provider-cleanup");
    }
  });
});
