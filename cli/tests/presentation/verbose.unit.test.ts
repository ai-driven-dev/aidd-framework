import { afterEach, describe, expect, it } from "vitest";
import { CLIOutput } from "../../src/presentation/output.js";

describe("CLIOutput AIDD_VERBOSE env var", () => {
  const originalEnv = process.env.AIDD_VERBOSE;

  afterEach(() => {
    process.env.AIDD_VERBOSE = originalEnv;
  });

  it("activates debug logging even when verbose flag is false", () => {
    process.env.AIDD_VERBOSE = "true";
    const written: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg: unknown) => {
      written.push(String(msg));
      return true;
    };
    try {
      const output = new CLIOutput(false);
      output.debug("env verbose debug");
      expect(written.some((m) => m.includes("env verbose debug"))).toBe(true);
    } finally {
      process.stderr.write = original;
    }
  });

  it("activates debug logging when verbose flag is true, regardless of AIDD_VERBOSE=false", () => {
    process.env.AIDD_VERBOSE = "false";
    const written: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (msg: unknown) => {
      written.push(String(msg));
      return true;
    };
    try {
      const output = new CLIOutput(true);
      output.debug("flag verbose debug");
      expect(written.some((m) => m.includes("flag verbose debug"))).toBe(true);
    } finally {
      process.stderr.write = original;
    }
  });
});
