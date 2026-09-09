/** The environment a use case reads a switch from; the composition root owns `process.env`. */
export interface Environment {
  get(name: string): string | undefined;
}
