/** Validates data against a JSON schema, throwing `JsonSchemaValidationError` on failure. */
export interface JsonSchemaValidator {
  validate(schema: object, data: unknown): void;
}
