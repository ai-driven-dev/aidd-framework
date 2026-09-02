import { describe, expect, it } from "vitest";
import {
  AdoptRequiresVersionError,
  AiddFilesDetectedError,
  AlreadyInitializedError,
  AuthStorageError,
  FlatTargetExistsError,
  HttpRedirectError,
  InputRequiredError,
  InvalidCategoryError,
  JsonParseError,
  NoManifestError,
  NotAuthenticatedError,
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

describe("AdoptRequiresVersionError", () => {
  it("includes adopt example in message", () => {
    const error = new AdoptRequiresVersionError();
    expect(error.message).toContain("--from <version|path> is required for adopt");
    expect(error.message).toContain("aidd setup --ai claude --from 3.6.0");
    expect(error.name).toBe("AdoptRequiresVersionError");
  });

  it("appends diagnostic suffix when provided", () => {
    const error = new AdoptRequiresVersionError("some diagnostic");
    expect(error.message).toContain("some diagnostic");
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

describe("NotAuthenticatedError", () => {
  it("has correct error name and auth hint in message", () => {
    const error = new NotAuthenticatedError();
    expect(error.name).toBe("NotAuthenticatedError");
    expect(error.message).toContain("aidd auth login");
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

describe("InvalidCategoryError", () => {
  it("includes the invalid category in the message", () => {
    const error = new InvalidCategoryError("invalid-cat");
    expect(error.name).toBe("InvalidCategoryError");
    expect(error.message).toContain("invalid-cat");
    expect(error.message).toContain("ai");
    expect(error.message).toContain("ide");
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
