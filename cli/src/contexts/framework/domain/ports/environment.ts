/** The ambient environment a use case reads a switch from, and publishes a token to. A port, so
 * neither layer reaches a global: the composition root supplies what owns `process.env`. */
export interface Environment {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}
