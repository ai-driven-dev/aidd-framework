import type { Environment } from "../domain/ports/environment.js";

/** Reads and writes at call time, never snapshotting at construction: an e2e run sets its
 * switches in the child process it spawns, after this adapter exists. */
export class EnvironmentAdapter implements Environment {
  get(name: string): string | undefined {
    return process.env[name];
  }

  set(name: string, value: string): void {
    process.env[name] = value;
  }
}
