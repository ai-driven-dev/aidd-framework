import type { Environment } from "../../../src/contexts/framework/domain/ports/environment.js";

export class InMemoryEnvironment implements Environment {
  private readonly values: Map<string, string>;

  constructor(initial: Readonly<Record<string, string>> = {}) {
    this.values = new Map(Object.entries(initial));
  }

  get(name: string): string | undefined {
    return this.values.get(name);
  }

  set(name: string, value: string): void {
    this.values.set(name, value);
  }
}
