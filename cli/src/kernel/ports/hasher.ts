import type { FileHash } from "../file.js";

export interface Hasher {
  hash(content: string): FileHash;
}
