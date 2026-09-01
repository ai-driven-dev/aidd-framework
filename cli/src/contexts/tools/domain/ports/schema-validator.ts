/**
 * Validates data against a JSON schema.
 * Throws JsonSchemaValidationError on validation failure.
 */
export interface JsonSchemaValidator {
  validate(schema: object, data: unknown): void;
}
