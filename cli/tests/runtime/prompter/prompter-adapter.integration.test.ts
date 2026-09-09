import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  InquirerPrompterAdapter,
  SilentPrompterAdapter,
} from "../../../src/runtime/prompter/prompter-adapter.js";

const ENTER = "\n";
const ARROW_DOWN = "\x1b[B";
const SPACE = " ";

function makeAdapter() {
  const inputStream = new PassThrough();
  const outputStream = new PassThrough();
  const adapter = new InquirerPrompterAdapter({ input: inputStream, output: outputStream });
  return { adapter, inputStream };
}

describe("SilentPrompterAdapter", () => {
  const adapter = new SilentPrompterAdapter();

  describe("confirm()", () => {
    it("always returns true", async () => {
      expect(await adapter.confirm("Are you sure?")).toBe(true);
    });
  });

  describe("input()", () => {
    it("returns empty string when no default provided", async () => {
      expect(await adapter.input("Enter value:")).toBe("");
    });

    it("returns the default value when provided", async () => {
      expect(await adapter.input("Enter value:", "hello")).toBe("hello");
    });
  });

  describe("select()", () => {
    it("returns the first non-disabled choice value", async () => {
      const result = await adapter.select("Pick one:", [
        { name: "A", value: "a" },
        { name: "B", value: "b", disabled: true },
      ]);
      expect(result).toBe("a");
    });

    it("skips disabled choices and returns first enabled", async () => {
      const result = await adapter.select("Pick one:", [
        { name: "X", value: "x", disabled: true },
        { name: "Y", value: "y" },
        { name: "Z", value: "z" },
      ]);
      expect(result).toBe("y");
    });

    it("throws when all choices are disabled", async () => {
      await expect(
        adapter.select("Pick one:", [{ name: "A", value: "a", disabled: true }])
      ).rejects.toThrow("No enabled choices available");
    });
  });

  describe("checkbox()", () => {
    it("returns checked and non-disabled choices", async () => {
      const result = await adapter.checkbox("Pick:", [
        { name: "A", value: "a", checked: true },
        { name: "B", value: "b" },
        { name: "C", value: "c", checked: true, disabled: true },
      ]);
      expect(result).toEqual(["a"]);
    });

    it("returns empty array when no choices are checked", async () => {
      const result = await adapter.checkbox("Pick:", [
        { name: "A", value: "a" },
        { name: "B", value: "b" },
      ]);
      expect(result).toEqual([]);
    });

    it("excludes disabled choices even when checked", async () => {
      const result = await adapter.checkbox("Pick:", [
        { name: "A", value: "a", checked: true, disabled: true },
        { name: "B", value: "b", checked: true },
      ]);
      expect(result).toEqual(["b"]);
    });
  });
});

describe("InquirerPrompterAdapter", () => {
  describe("confirm()", () => {
    it("returns true when user types y", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.confirm("Continue?");
      setImmediate(() => inputStream.write(`y${ENTER}`));
      expect(await result).toBe(true);
    });

    it("returns false when user types n", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.confirm("Continue?");
      setImmediate(() => inputStream.write(`n${ENTER}`));
      expect(await result).toBe(false);
    });

    it("returns false when user presses Enter without input (default is false)", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.confirm("Continue?");
      setImmediate(() => inputStream.write(ENTER));
      expect(await result).toBe(false);
    });
  });

  describe("input()", () => {
    it("returns typed text", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.input("Enter name:");
      setImmediate(() => inputStream.write(`hello${ENTER}`));
      expect(await result).toBe("hello");
    });

    it("returns default value when user presses Enter without typing", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.input("Enter name:", "default-value");
      setImmediate(() => inputStream.write(ENTER));
      expect(await result).toBe("default-value");
    });

    it("returns empty string when user presses Enter with no default", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.input("Enter name:");
      setImmediate(() => inputStream.write(ENTER));
      expect(await result).toBe("");
    });
  });

  describe("select()", () => {
    it("returns the first choice when user presses Enter", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.select("Pick:", [
        { name: "Option A", value: "a" },
        { name: "Option B", value: "b" },
      ]);
      setImmediate(() => inputStream.write(ENTER));
      expect(await result).toBe("a");
    });

    it("returns the second choice when user presses arrow down then Enter", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.select("Pick:", [
        { name: "Option A", value: "a" },
        { name: "Option B", value: "b" },
      ]);
      setImmediate(() => inputStream.write(`${ARROW_DOWN}${ENTER}`));
      expect(await result).toBe("b");
    });
  });

  describe("checkbox()", () => {
    it("returns pre-checked items when user presses Enter immediately", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.checkbox("Pick:", [
        { name: "A", value: "a", checked: true },
        { name: "B", value: "b" },
      ]);
      setImmediate(() => inputStream.write(ENTER));
      expect(await result).toEqual(["a"]);
    });

    it("returns empty array when no items are pre-checked and user presses Enter", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.checkbox("Pick:", [
        { name: "A", value: "a" },
        { name: "B", value: "b" },
      ]);
      setImmediate(() => inputStream.write(ENTER));
      expect(await result).toEqual([]);
    });

    it("returns toggled item when user presses Space then Enter", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.checkbox("Pick:", [
        { name: "A", value: "a" },
        { name: "B", value: "b" },
      ]);
      setImmediate(() => inputStream.write(`${SPACE}${ENTER}`));
      expect(await result).toEqual(["a"]);
    });
  });

  describe("resolveConflict()", () => {
    it("returns overwrite when user presses Enter (first choice)", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.resolveConflict("src/foo.ts", "modified");
      setImmediate(() => inputStream.write(ENTER));
      expect(await result).toBe("overwrite");
    });

    it("returns keep when user presses arrow down then Enter", async () => {
      const { adapter, inputStream } = makeAdapter();
      const result = adapter.resolveConflict("src/foo.ts", "deleted");
      setImmediate(() => inputStream.write(`${ARROW_DOWN}${ENTER}`));
      expect(await result).toBe("keep");
    });
  });
});
