import { describe, expect, it } from "vitest";
import {
  buildClaudeFlatContract,
  buildCodexFlatContract,
  buildCopilotFlatContract,
  buildCursorFlatContract,
  buildOpencodeFlatContract,
} from "../../../src/application/use-cases/framework/strategies/tool-contracts.js";
import { claude } from "../../../src/domain/tools/ai/claude.js";
import { codex } from "../../../src/domain/tools/ai/codex.js";
import { copilot } from "../../../src/domain/tools/ai/copilot.js";
import { cursor } from "../../../src/domain/tools/ai/cursor.js";
import { opencode } from "../../../src/domain/tools/ai/opencode.js";
import type {
  ArtifactContract,
  ToolBuildContract,
} from "../../../src/domain/tools/build-contract.js";

interface HooksDeclaringTool {
  readonly toolId: string;
  readonly capabilities: { readonly plugins: { readonly acceptsHooks: boolean } };
}

/**
 * A tool declares whether it runs a delivered hook once, on its own PluginsCapability
 * (acceptsHooks). The flat build contract used by `aidd setup` and `aidd framework build`
 * has to agree — this is the state OpenCode was in: acceptsHooks: true declared, and a
 * build contract that still hard-coded `hooks: { supported: false }` on a route no
 * declaration change could reach.
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
