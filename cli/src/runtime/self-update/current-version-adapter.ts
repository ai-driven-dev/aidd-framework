import pkg from "../../../package.json" with { type: "json" };
import type { VersionReader } from "../../kernel/ports/version-reader.js";

export class CurrentVersionAdapter implements VersionReader {
  get(): string {
    return pkg.version;
  }
}
