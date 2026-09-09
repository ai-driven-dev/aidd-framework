import { describe, expect, it } from "vitest";
import {
  AiddFilesDetectedError,
  AlreadyInitializedError,
  AuthStorageError,
  FlatTargetExistsError,
  HttpRedirectError,
  InputRequiredError,
  JsonParseError,
  NoManifestError,
  OutDirNotDirectoryError,
  ToolNotInstalledError,
} from "../../src/kernel/errors.js";

describe("NoManifestError", () => {
  it("includes aidd setup hint in message", () => {
    const error = new NoManifestError();
    expect(error.message).toContain("aidd setup");
    expect(error.name).toBe("NoManifestError");
  });
});

describe("AiddFilesDetectedError", () => {
  it("includes setup hint in message", () => {
    const error = new AiddFilesDetectedError();
    expect(error.message).toContain("AIDD files detected but no manifest found");
    expect(error.message).toContain("aidd setup");
    expect(error.name).toBe("AiddFilesDetectedError");
  });
});

describe("FlatTargetExistsError", () => {
  it("has correct error name", () => {
    const error = new FlatTargetExistsError(
      "/out/.github/agents/my-plugin/foo.agent.md",
      "my-plugin"
    );
    expect(error.name).toBe("FlatTargetExistsError");
  });

  it("includes the conflicting path in the message", () => {
    const error = new FlatTargetExistsError(
      "/out/.github/agents/my-plugin/foo.agent.md",
      "my-plugin"
    );
    expect(error.message).toContain("/out/.github/agents/my-plugin/foo.agent.md");
  });

  it("includes the plugin name in the message", () => {
    const error = new FlatTargetExistsError(
      "/out/.github/agents/my-plugin/foo.agent.md",
      "my-plugin"
    );
    expect(error.message).toContain("my-plugin");
  });

  it("mentions --force hint in message", () => {
    const error = new FlatTargetExistsError(
      "/out/.github/agents/my-plugin/foo.agent.md",
      "my-plugin"
    );
    expect(error.message).toContain("--force");
  });
});

describe("OutDirNotDirectoryError", () => {
  it("has correct error name", () => {
    const error = new OutDirNotDirectoryError("/tmp/some-out");
    expect(error.name).toBe("OutDirNotDirectoryError");
  });

  it("includes the outDir path in the message", () => {
    const error = new OutDirNotDirectoryError("/tmp/some-out");
    expect(error.message).toContain("/tmp/some-out");
  });

  it("does not mention source directory in the message", () => {
    const error = new OutDirNotDirectoryError("/tmp/some-out");
    expect(error.message).not.toContain("--source");
    expect(error.message).toContain("not a directory");
  });
});

describe("AlreadyInitializedError", () => {
  it("has default message when no argument provided", () => {
    const error = new AlreadyInitializedError();
    expect(error.name).toBe("AlreadyInitializedError");
    expect(error.message).toContain("Already initialized");
  });

  it("uses provided message when given", () => {
    const error = new AlreadyInitializedError("Custom message here.");
    expect(error.message).toBe("Custom message here.");
  });
});

describe("InputRequiredError", () => {
  it("carries the provided message", () => {
    const error = new InputRequiredError("Prompt answer is required.");
    expect(error.name).toBe("InputRequiredError");
    expect(error.message).toBe("Prompt answer is required.");
  });
});

describe("ToolNotInstalledError", () => {
  it("includes tool ID in message without context", () => {
    const error = new ToolNotInstalledError("claude");
    expect(error.name).toBe("ToolNotInstalledError");
    expect(error.message).toContain("claude");
  });

  it("includes context and tool ID when context is provided", () => {
    const error = new ToolNotInstalledError("cursor", "The target tool");
    expect(error.message).toContain("cursor");
    expect(error.message).toContain("The target tool");
  });
});

describe("HttpRedirectError", () => {
  it("includes the URL in the message and sets error name", () => {
    const error = new HttpRedirectError("https://example.com/redirect");
    expect(error.name).toBe("HttpRedirectError");
    expect(error.message).toContain("https://example.com/redirect");
    expect(error.url).toBe("https://example.com/redirect");
  });
});

describe("JsonParseError", () => {
  it("includes the path and cause in the message", () => {
    const error = new JsonParseError("/some/file.json", "Unexpected token");
    expect(error.name).toBe("JsonParseError");
    expect(error.message).toContain("/some/file.json");
    expect(error.message).toContain("Unexpected token");
  });
});

describe("AuthStorageError", () => {
  it("carries the provided message", () => {
    const error = new AuthStorageError("Failed to write auth file");
    expect(error.name).toBe("AuthStorageError");
    expect(error.message).toBe("Failed to write auth file");
  });
});
