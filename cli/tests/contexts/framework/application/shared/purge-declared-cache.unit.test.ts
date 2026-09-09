import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  purgeCacheIfEmptyAndConfirmed,
  resolveCacheCandidate,
} from "../../../../../src/contexts/framework/application/shared/purge-declared-cache.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import {
  errnoError,
  FaultingFileAdapter,
} from "../../../../helpers/ports/faulting-file-adapter.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const CACHE_ROOT = "/cache";
const CANDIDATE = join(CACHE_ROOT, "mkt");
const LABEL = "codex: cache for 'mkt'";

describe("resolveCacheCandidate", () => {
  it("answers nothing, silently, when the cache root does not exist", async () => {
    const fs = new FaultingFileAdapter();
    fs.failOn("realpath", CACHE_ROOT, errnoError("ENOENT"));
    const logger = new CapturingLogger();

    const candidate = await resolveCacheCandidate(fs, logger, CACHE_ROOT, "mkt", LABEL);

    expect(candidate).toBeNull();
    expect(logger.allMessages).toStrictEqual([]);
  });

  it("answers nothing, silently, when the candidate does not exist", async () => {
    const fs = new FaultingFileAdapter();
    fs.failOn("realpath", CANDIDATE, errnoError("ENOENT"));
    const logger = new CapturingLogger();

    const candidate = await resolveCacheCandidate(fs, logger, CACHE_ROOT, "mkt", LABEL);

    expect(candidate).toBeNull();
    expect(logger.allMessages).toStrictEqual([]);
  });
});

describe("purgeCacheIfEmptyAndConfirmed", () => {
  it("purges an empty, confirmed cache and says so", async () => {
    const fs = new InMemoryFileAdapter();
    const logger = new CapturingLogger();

    await purgeCacheIfEmptyAndConfirmed(fs, logger, CANDIDATE, true, LABEL);

    expect(logger.infoMessages).toStrictEqual([`${LABEL} purged: ${CANDIDATE}`]);
    expect(logger.warnMessages).toStrictEqual([]);
  });

  it("treats a cache that no longer exists as nothing to purge", async () => {
    const fs = new FaultingFileAdapter();
    fs.failOn("listDirectory", CANDIDATE, errnoError("ENOENT"));
    const logger = new CapturingLogger();

    await purgeCacheIfEmptyAndConfirmed(fs, logger, CANDIDATE, true, LABEL);

    expect(logger.allMessages).toStrictEqual([]);
  });

  it("propagates a listing failure other than absence", async () => {
    const fs = new FaultingFileAdapter();
    fs.failOn("listDirectory", CANDIDATE, errnoError("EACCES"));

    await expect(
      purgeCacheIfEmptyAndConfirmed(fs, new CapturingLogger(), CANDIDATE, true, LABEL)
    ).rejects.toThrow("EACCES: planted by the test");
  });
});
