import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AjvSchemaValidatorAdapter } from "../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import { JsonSchemaValidationError } from "../../../src/kernel/errors.js";

const schemaPath = new URL("../../../assets/schemas/codex-plugin-manifest.json", import.meta.url);
const schema = JSON.parse(readFileSync(fileURLToPath(schemaPath), "utf8")) as object;
const validator = new AjvSchemaValidatorAdapter();

function validate(data: unknown): void {
  validator.validate(schema, data);
}

describe("codex-plugin-manifest.json schema", () => {
  describe("valid documents", () => {
    it("validates a minimal document with only name", () => {
      expect(() => validate({ name: "aidd-dev" })).not.toThrow();
    });

    it("validates a full passthrough document with all known fields", () => {
      expect(() =>
        validate({
          name: "aidd-dev",
          version: "1.0.0",
          description: "Dev plugin",
          author: "Test Author",
          homepage: "https://example.com",
          repository: "https://github.com/example/plugin",
          license: "MIT",
          keywords: ["dev", "ai"],
          skills: ["./skills/01-plan", "./skills/02-implement"],
          hooks: "./hooks/hooks.json",
          mcpServers: "./.mcp.json",
        })
      ).not.toThrow();
    });

    it("validates author as an object with name, email, url", () => {
      expect(() =>
        validate({
          name: "aidd-dev",
          author: { name: "Test", email: "test@example.com", url: "https://example.com" },
        })
      ).not.toThrow();
    });

    it("validates author as an object with only name", () => {
      expect(() =>
        validate({
          name: "aidd-dev",
          author: { name: "Test" },
        })
      ).not.toThrow();
    });

    it("validates interface field as an object", () => {
      expect(() =>
        validate({
          name: "aidd-dev",
          interface: { theme: "dark" },
        })
      ).not.toThrow();
    });
  });

  describe("invalid documents", () => {
    it("rejects a document missing name", () => {
      expect(() => validate({ version: "1.0.0" })).toThrow(JsonSchemaValidationError);
    });

    it("rejects an unknown key 'agents' (additionalProperties: false)", () => {
      expect(() => validate({ name: "aidd-dev", agents: ["./agents"] })).toThrow(
        JsonSchemaValidationError
      );
    });

    it("rejects an unknown key 'commands'", () => {
      expect(() => validate({ name: "aidd-dev", commands: ["./commands"] })).toThrow(
        JsonSchemaValidationError
      );
    });

    it("rejects an unknown key '$schema'", () => {
      expect(() =>
        validate({ name: "aidd-dev", $schema: "https://example.com/schema.json" })
      ).toThrow(JsonSchemaValidationError);
    });
  });
});
