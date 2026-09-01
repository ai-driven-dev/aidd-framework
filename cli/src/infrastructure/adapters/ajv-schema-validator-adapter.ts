import { createRequire } from "node:module";
import type { JsonSchemaValidator } from "../../domain/ports/json-schema-validator.js";
import { JsonSchemaValidationError } from "../../kernel/errors.js";

// CJS interop: ajv v8 + ajv-formats are CommonJS; NodeNext requires createRequire.
// require("ajv") returns a module where the constructor is at .default.
const require = createRequire(import.meta.url);
const ajvModule = require("ajv") as { default: new (opts?: unknown) => AjvInstance };
const AjvClass = ajvModule.default;
const addFormats = require("ajv-formats") as (ajv: AjvInstance) => void;

interface ValidateFunction {
  (data: unknown): boolean;
  errors?: AjvError[] | null;
}

interface AjvInstance {
  compile(schema: object): ValidateFunction;
}

interface AjvError {
  instancePath: string;
  message?: string;
}

export class AjvSchemaValidatorAdapter implements JsonSchemaValidator {
  private readonly ajv: AjvInstance;

  constructor() {
    this.ajv = new AjvClass({ allErrors: true });
    addFormats(this.ajv);
  }

  validate(schema: object, data: unknown): void {
    const validateFn = this.ajv.compile(schema);
    const valid = validateFn(data);
    if (!valid) {
      const errors = (validateFn.errors ?? []).map(
        (e) => `${e.instancePath || "(root)"} ${e.message ?? "unknown error"}`
      );
      throw new JsonSchemaValidationError(errors);
    }
  }
}
