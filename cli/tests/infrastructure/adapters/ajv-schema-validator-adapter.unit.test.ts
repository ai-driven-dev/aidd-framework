import { describe, expect, it } from "vitest";
import { AjvSchemaValidatorAdapter } from "../../../src/infrastructure/adapters/ajv-schema-validator-adapter.js";
import { JsonSchemaValidationError } from "../../../src/kernel/errors.js";

const STRING_SCHEMA = { type: "string" };
const OBJECT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "number" },
  },
  required: ["name"],
};

describe("AjvSchemaValidatorAdapter", () => {
  describe("validate", () => {
    it("does not throw for valid data against string schema", () => {
      const validator = new AjvSchemaValidatorAdapter();
      expect(() => validator.validate(STRING_SCHEMA, "hello")).not.toThrow();
    });

    it("throws JsonSchemaValidationError for invalid type", () => {
      const validator = new AjvSchemaValidatorAdapter();
      expect(() => validator.validate(STRING_SCHEMA, 42)).toThrow(JsonSchemaValidationError);
    });

    it("does not throw for valid object", () => {
      const validator = new AjvSchemaValidatorAdapter();
      expect(() => validator.validate(OBJECT_SCHEMA, { name: "Alice", age: 30 })).not.toThrow();
    });

    it("throws when required property is missing", () => {
      const validator = new AjvSchemaValidatorAdapter();
      expect(() => validator.validate(OBJECT_SCHEMA, { age: 30 })).toThrow(
        JsonSchemaValidationError
      );
    });

    it("error message includes field path", () => {
      const validator = new AjvSchemaValidatorAdapter();
      try {
        validator.validate(OBJECT_SCHEMA, { name: 123 });
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(JsonSchemaValidationError);
        expect((e as Error).message).toContain("/name");
      }
    });

    it("collects all errors when allErrors is true", () => {
      const schema = {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      };
      const validator = new AjvSchemaValidatorAdapter();
      try {
        validator.validate(schema, {});
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(JsonSchemaValidationError);
        expect((e as Error).message).toContain("a");
        expect((e as Error).message).toContain("b");
      }
    });
  });
});
