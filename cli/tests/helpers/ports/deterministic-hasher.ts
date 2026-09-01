import { createHash } from "node:crypto";
import { FileHash } from "../../../src/kernel/file.js";
import type { Hasher } from "../../../src/kernel/ports/hasher.js";

/**
 * Deterministic in-memory hasher using real MD5.
 * Returns the same hash as HasherAdapter for identical content — keeping expected
 * hash values valid across adapter and in-memory implementations.
 */
export class DeterministicHasher implements Hasher {
  hash(content: string): FileHash {
    const hex = createHash("md5").update(content, "utf-8").digest("hex");
    return new FileHash(hex);
  }
}
