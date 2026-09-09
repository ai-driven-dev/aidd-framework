import { afterEach, describe, expect, it } from "vitest";
import { EnvironmentAdapter } from "../../../../src/contexts/framework/infrastructure/environment-adapter.js";

const VARIABLE = "AIDD_ENVIRONMENT_ADAPTER_PROBE";

describe("EnvironmentAdapter", () => {
  afterEach(() => {
    delete process.env[VARIABLE];
  });

  it("reads a variable set after it was constructed", () => {
    const environment = new EnvironmentAdapter();
    process.env[VARIABLE] = "later";

    expect(environment.get(VARIABLE)).toBe("later");
  });

  it("writes a variable the process itself then sees", () => {
    new EnvironmentAdapter().set(VARIABLE, "written");

    expect(process.env[VARIABLE]).toBe("written");
  });
});
