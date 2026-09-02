import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HookTrustReaderAdapter } from "../../../src/infrastructure/adapters/hook-trust-reader-adapter.js";

/**
 * Codex is the one host that will decline to run a hook and say nothing about it, so this
 * read is what lets `aidd telemetry check` tell "the hook is dead" apart from "the hook was
 * never approved". Both leave an empty journal; only one is something a person can fix, and
 * naming the wrong one sends them looking in the wrong place.
 *
 * Tested against a real `config.toml` rather than a double because the whole method is a
 * parse of a file Codex writes in its own shape — a double would only assert this test's
 * idea of that shape.
 */
const created: string[] = [];
const savedHome = process.env.HOME;

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
});

/** A throwaway home, with `config.toml` written into it when `content` is given and left
 * absent when it is not. */
function codexHome(content?: string): string {
  const home = mkdtempSync(join(tmpdir(), "aidd-hook-trust-"));
  created.push(home);
  process.env.HOME = home;
  if (content !== undefined) {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "config.toml"), content);
  }
  return home;
}

/** The exact key Codex writes once a hook is approved: the plugin, its hooks file, the
 * event, and the two zeroes Codex appends. */
const APPROVED_KEY = '[hooks.state."aidd-telemetry@1.0.0:hooks/hooks.json:session_start:0:0"]';

describe("reading whether Codex has been told it may run the recorder's hook", () => {
  it("reads an approved hook as trusted", async () => {
    codexHome(`${APPROVED_KEY}\ntrusted_hash = "abc123"\n`);

    expect(await new HookTrustReaderAdapter().read()).toEqual({
      readable: true,
      configPath: join(process.env.HOME ?? "", ".codex", "config.toml"),
      trusted: true,
    });
  });

  // The key on its own is Codex having seen the hook, not having approved it. Only the
  // `trusted_hash` line under it says approved.
  it("reads the key without its trusted_hash as not trusted", async () => {
    codexHome(`${APPROVED_KEY}\nsomething_else = "1"\n`);

    const trust = await new HookTrustReaderAdapter().read();

    expect(trust).toMatchObject({ readable: true, trusted: false });
  });

  it("reads a config naming no hook of ours as not trusted", async () => {
    codexHome(
      '[hooks.state."someone-else@1.0.0:hooks/hooks.json:session_start:0:0"]\ntrusted_hash = "x"\n'
    );

    expect(await new HookTrustReaderAdapter().read()).toMatchObject({ trusted: false });
  });

  // A hook approved under a different event is a different key entirely, and reads as
  // untrusted rather than as approval carried over from the name it used to have.
  it("reads approval under another event as not trusting session_start", async () => {
    codexHome(
      '[hooks.state."aidd-telemetry@1.0.0:hooks/hooks.json:tool_used:0:0"]\ntrusted_hash = "x"\n'
    );

    expect(await new HookTrustReaderAdapter().read()).toMatchObject({ trusted: false });
  });

  // Unreadable is not untrusted: the first says nothing is known, the second is a fact
  // about Codex's own state, and a check that conflated them would name a cause that was
  // never established.
  it("reads an absent config as unreadable, naming the path and the reason", async () => {
    const home = codexHome();

    const trust = await new HookTrustReaderAdapter().read();

    expect(trust.readable).toBe(false);
    expect("trusted" in trust).toBe(false);
    expect(trust.readable === false ? trust.reason : "").toContain(
      join(home, ".codex", "config.toml")
    );
    expect(trust.readable === false ? trust.reason : "").toContain("ENOENT");
  });

  // `HOME`, not `os.homedir()`: the two differ on Windows and under a sandboxed test, and
  // reading the wrong one answers about a config nobody here wrote.
  it("reads the home this process was told to use, never the machine's own", async () => {
    const home = codexHome(`${APPROVED_KEY}\ntrusted_hash = "abc123"\n`);

    const trust = await new HookTrustReaderAdapter().read();

    expect(trust.readable === true ? trust.configPath : "").toBe(
      join(home, ".codex", "config.toml")
    );
  });
});
