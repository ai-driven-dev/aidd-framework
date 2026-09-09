import { describe, expect, it } from "vitest";
import type {
  ArtifactContract,
  ToolBuildContract,
} from "../../../../src/contexts/tools/domain/build-contract.js";
import { buildClaudeFlatContract } from "../../../../src/contexts/tools/domain/profiles/claude/build.js";
import { claude } from "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import { buildCodexFlatContract } from "../../../../src/contexts/tools/domain/profiles/codex/build.js";
import { codex } from "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import { buildCopilotFlatContract } from "../../../../src/contexts/tools/domain/profiles/copilot/build.js";
import { copilot } from "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import { buildCursorFlatContract } from "../../../../src/contexts/tools/domain/profiles/cursor/build.js";
import { cursor } from "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { buildOpencodeFlatContract } from "../../../../src/contexts/tools/domain/profiles/opencode/build.js";
import { opencode } from "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";

interface HooksDeclaringTool {
  readonly toolId: string;
  readonly capabilities: { readonly plugins: { readonly acceptsHooks: boolean } };
}

/**
 * A tool declares whether it runs a delivered hook once, on its own `acceptsHooks`. A build
 * contract hard-coding its own answer would sit on a route no declaration can reach.
 */
const FLAT_CONTRACTS: ReadonlyArray<[HooksDeclaringTool, () => ToolBuildContract]> = [
  [claude, buildClaudeFlatContract],
  [cursor, buildCursorFlatContract],
  [copilot, buildCopilotFlatContract],
  [codex, buildCodexFlatContract],
  [opencode, buildOpencodeFlatContract],
];

function isSupported(artifact: ArtifactContract): boolean {
  return artifact.supported;
}

describe("the flat build contract's hooks support", () => {
  it("matches the tool's own acceptsHooks declaration, for every flat-mode tool", () => {
    let examined = 0;
    for (const [tool, buildContract] of FLAT_CONTRACTS) {
      examined++;
      const declared = tool.capabilities.plugins.acceptsHooks;
      const delivered = isSupported(buildContract().artifacts.hooks);
      expect(delivered, tool.toolId).toBe(declared);
    }
    // A tool list that stopped naming any flat-mode tool would pass by never reaching
    // the assertion above, which is the failure shape this file exists to catch.
    expect(examined).not.toBe(0);
  });
});
