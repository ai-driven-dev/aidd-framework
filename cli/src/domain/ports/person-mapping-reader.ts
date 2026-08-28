import type { PersonMapping } from "../models/person-mapping.js";

/**
 * What resolving a report against a mapping needs: the mapping, or `null` when none is
 * declared. One method, so the read path never knows where the mapping came from — a file
 * under the OS user's own profile today, something else tomorrow.
 *
 * Never throws, the same reason `PersonIdentityReader.read()` never does: a missing
 * mapping, a damaged one, and nobody having declared one all answer the same way here,
 * since resolving every identifier as `unresolved` is the correct reading in every case,
 * and folding a read failure into that shape here keeps a caller that only wants the
 * mapping simple. A caller that has to tell "nobody declared one" apart from "one exists
 * but could not be read" — the report path's own caveat — reads through `readStrict()` on
 * `PersonMappingStore` instead, and decides what the distinction costs.
 */
export interface PersonMappingReader {
  read(): Promise<PersonMapping | null>;
}
