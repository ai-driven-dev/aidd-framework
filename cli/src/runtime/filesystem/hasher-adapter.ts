import { createHash } from "node:crypto";
import { FileHash } from "../../kernel/file.js";
import type { Hasher } from "../../kernel/ports/hasher.js";

export class HasherAdapter implements Hasher {
  hash(content: string): FileHash {
    const hex = createHash("md5").update(content, "utf-8").digest("hex");
    return new FileHash(hex);
  }
}
