import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProjectRootForReferences } from "../../../../../src/contexts/framework/application/shared/shared-source-reference-support.js";
import { CLIOutput } from "../../../../../src/presentation/output.js";
import { FileAdapter } from "../../../../../src/runtime/filesystem/file-adapter.js";
import { HasherAdapter } from "../../../../../src/runtime/filesystem/hasher-adapter.js";

let root: string;

beforeEach(async () => {
  // macOS aliases its own tmpdir under a symlink (`/var` -> `/private/var`), so a fixture
  // built under an unresolved `root` would disagree with itself.
  root = await realpath(await mkdtemp(join(tmpdir(), "aidd-shared-source-reference-")));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("resolveProjectRootForReferences against a real symlink", () => {
  it("resolves a project reached through a symlink to its real location", async () => {
    const real = join(root, "real-project");
    const link = join(root, "link-project");
    await mkdir(real, { recursive: true });
    await symlink(real, link);
    const fs = new FileAdapter(new HasherAdapter(), new CLIOutput(false));

    const resolved = await resolveProjectRootForReferences(fs, link);

    expect(resolved).toBe(real);
    expect(resolved).not.toBe(link);
  });

  it("falls back to the path as given for a project that no longer exists", async () => {
    const vanished = join(root, "gone");
    const fs = new FileAdapter(new HasherAdapter(), new CLIOutput(false));

    const resolved = await resolveProjectRootForReferences(fs, vanished);

    expect(resolved).toBe(vanished);
  });
});
