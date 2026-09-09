import { describe, expect, it } from "vitest";
import { CLIOutput } from "../../src/presentation/output.js";

describe("CLIOutput", () => {
  describe("debug()", () => {
    it("writes to stderr with [verbose] prefix when verbose is true", () => {
      const written: string[] = [];
      const original = process.stderr.write.bind(process.stderr);
      process.stderr.write = (msg: unknown) => {
        written.push(String(msg));
        return true;
      };

      try {
        const output = new CLIOutput(true);
        output.debug("debug message");
        expect(written.some((m) => m.includes("[verbose]") && m.includes("debug message"))).toBe(
          true
        );
      } finally {
        process.stderr.write = original;
      }
    });

    it("does not write when verbose is false", () => {
      const written: string[] = [];
      const original = process.stderr.write.bind(process.stderr);
      process.stderr.write = (msg: unknown) => {
        written.push(String(msg));
        return true;
      };

      try {
        const output = new CLIOutput(false);
        output.debug("debug message");
        expect(written.length).toBe(0);
      } finally {
        process.stderr.write = original;
      }
    });

    it("does not write when verbose is not set (defaults to false)", () => {
      const written: string[] = [];
      const original = process.stderr.write.bind(process.stderr);
      process.stderr.write = (msg: unknown) => {
        written.push(String(msg));
        return true;
      };

      try {
        const output = new CLIOutput();
        output.debug("silent debug");
        expect(written.length).toBe(0);
      } finally {
        process.stderr.write = original;
      }
    });

    it("respects AIDD_VERBOSE env var even when verbose flag is false", () => {
      const prev = process.env.AIDD_VERBOSE;
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
        process.env.AIDD_VERBOSE = prev;
      }
    });
  });

  describe("info()", () => {
    it("always writes to stdout regardless of verbose", () => {
      const written: string[] = [];
      const original = process.stdout.write.bind(process.stdout);
      process.stdout.write = (msg: unknown) => {
        written.push(String(msg));
        return true;
      };

      try {
        const output = new CLIOutput(false);
        output.info("info message");
        expect(written.some((m) => m.includes("info message"))).toBe(true);
      } finally {
        process.stdout.write = original;
      }
    });
  });

  describe("warn()", () => {
    it("always writes to stderr with Warning: prefix", () => {
      const written: string[] = [];
      const original = process.stderr.write.bind(process.stderr);
      process.stderr.write = (msg: unknown) => {
        written.push(String(msg));
        return true;
      };

      try {
        const output = new CLIOutput(false);
        output.warn("something wrong");
        expect(written.some((m) => m.includes("Warning:") && m.includes("something wrong"))).toBe(
          true
        );
      } finally {
        process.stderr.write = original;
      }
    });
  });

  describe("error()", () => {
    it("always writes to stderr with Error: prefix", () => {
      const written: string[] = [];
      const original = process.stderr.write.bind(process.stderr);
      process.stderr.write = (msg: unknown) => {
        written.push(String(msg));
        return true;
      };

      try {
        const output = new CLIOutput(false);
        output.error("something failed");
        expect(written.some((m) => m.includes("Error:") && m.includes("something failed"))).toBe(
          true
        );
      } finally {
        process.stderr.write = original;
      }
    });
  });

  describe("success() and print()", () => {
    it("writes to stdout with no prefix", () => {
      const written: string[] = [];
      const original = process.stdout.write.bind(process.stdout);
      process.stdout.write = (msg: unknown) => {
        written.push(String(msg));
        return true;
      };

      try {
        const output = new CLIOutput(false);
        output.success("Installed claude (42 files)");
        output.print("  + .claude/CLAUDE.md");
        expect(written.some((m) => m.includes("Installed claude (42 files)"))).toBe(true);
        expect(written.some((m) => m.includes("  + .claude/CLAUDE.md"))).toBe(true);
      } finally {
        process.stdout.write = original;
      }
    });
  });
});
