import { createHash } from "node:crypto";
import { FileHash } from "../../../src/kernel/file.js";
import type { Hasher } from "../../../src/kernel/ports/hasher.js";

/** Deterministic in-memory hasher using real MD5: the same hash as `HasherAdapter` for identical
 * content, so an expected value stays valid across the adapter and this one. */
export class DeterministicHasher implements Hasher {
  hash(content: string): FileHash {
    const hex = createHash("md5").update(content, "utf-8").digest("hex");
    return new FileHash(hex);
  }
}
