import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AjvSchemaValidatorAdapter } from "../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import { JsonSchemaValidationError } from "../../../src/kernel/errors.js";

const schemaPath = new URL(
  "../../../assets/schemas/claude-marketplace-manifest.json",
  import.meta.url
);
const schema = JSON.parse(readFileSync(fileURLToPath(schemaPath), "utf8")) as object;
const validator = new AjvSchemaValidatorAdapter();

function validate(data: unknown): void {
  validator.validate(schema, data);
}

describe("claude-marketplace-manifest.json schema", () => {
  describe("valid documents", () => {
    it("validates the framework-real fixture marketplace.json successfully", () => {
      const fixturePath = new URL(
        "../../../tests/fixtures/framework-real/.claude-plugin/marketplace.json",
        import.meta.url
      );
      const fixture = JSON.parse(readFileSync(fileURLToPath(fixturePath), "utf8")) as unknown;
      expect(() => validate(fixture)).not.toThrow();
    });

    it("validates a minimal document with just name and plugins", () => {
      expect(() =>
        validate({
          name: "my-marketplace",
          plugins: [
            {
              name: "aidd-dev",
              source: "./plugins/aidd-dev",
              description: "Dev plugin",
              version: "1.0.0",
            },
          ],
        })
      ).not.toThrow();
    });

    it("validates a full document with optional fields", () => {
      expect(() =>
        validate({
          name: "my-marketplace",
          version: "1.0.0",
          description: "A marketplace",
          owner: { name: "Test Org" },
          plugins: [
            {
              name: "aidd-dev",
              source: "./plugins/aidd-dev",
              description: "Dev plugin",
              version: "1.0.0",
              strict: true,
              recommended: true,
            },
          ],
        })
      ).not.toThrow();
    });
  });

  describe("invalid documents", () => {
    it("rejects a document with missing plugins array", () => {
      expect(() => validate({ name: "my-marketplace" })).toThrow(JsonSchemaValidationError);
    });

    it("rejects a plugin entry missing name", () => {
      expect(() =>
        validate({
          name: "my-marketplace",
          plugins: [{ source: "./plugins/foo", description: "foo", version: "1.0.0" }],
        })
      ).toThrow(JsonSchemaValidationError);
    });

    it("rejects a plugin entry missing source", () => {
      expect(() =>
        validate({
          name: "my-marketplace",
          plugins: [{ name: "foo", description: "foo", version: "1.0.0" }],
        })
      ).toThrow(JsonSchemaValidationError);
    });

    it("rejects a plugin entry missing version", () => {
      expect(() =>
        validate({
          name: "my-marketplace",
          plugins: [{ name: "foo", source: "./plugins/foo", description: "foo" }],
        })
      ).toThrow(JsonSchemaValidationError);
    });
  });
});
