import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../src/contexts/distribution/domain/marketplace.js";
import {
  printInstalledPlugins,
  printPluginInstallOutcome,
  printPluginRemoved,
  printPluginSearchHits,
  printPluginsUpdated,
} from "../../../src/presentation/display/plugin-display.js";
import { CapturingOutput } from "../../helpers/ports/capturing-output.js";

function marketplace(name: string): Marketplace {
  return Marketplace.create({
    name,
    source: { kind: "local", path: `/tmp/${name}` },
    scope: "project",
    addedAt: "2020-01-01T00:00:00.000Z",
  });
}

describe("printInstalledPlugins", () => {
  it("says none is installed when no tool holds one", () => {
    const output = new CapturingOutput(false);

    printInstalledPlugins(output, new Map());

    expect(output.captured).toEqual([{ level: "info", message: "No plugins installed." }]);
  });

  it("heads each tool and indents its plugins with their versions", () => {
    const output = new CapturingOutput(false);

    printInstalledPlugins(output, new Map([["claude", [{ name: "aidd-dev", version: "1.0.0" }]]]));

    expect(output.captured).toEqual([
      { level: "print", message: "claude:" },
      { level: "print", message: "  aidd-dev@1.0.0" },
    ]);
  });

  it("skips a tool holding nothing rather than heading an empty list", () => {
    const output = new CapturingOutput(false);

    printInstalledPlugins(
      output,
      new Map([
        ["cursor", []],
        ["claude", [{ name: "aidd-dev", version: "1.0.0" }]],
      ])
    );

    expect(output.captured).toEqual([
      { level: "print", message: "claude:" },
      { level: "print", message: "  aidd-dev@1.0.0" },
    ]);
  });

  it("says none is installed when every tool holds an empty list", () => {
    const output = new CapturingOutput(false);

    printInstalledPlugins(output, new Map([["cursor", []]]));

    expect(output.captured).toEqual([{ level: "info", message: "No plugins installed." }]);
  });
});

describe("printPluginInstallOutcome", () => {
  it("says nothing was selected when the interactive pick installed none", () => {
    const output = new CapturingOutput(false);

    printPluginInstallOutcome(output, { kind: "picked", installed: [] });

    expect(output.captured).toEqual([{ level: "info", message: "No plugins selected." }]);
  });

  it("counts and names what an interactive pick installed", () => {
    const output = new CapturingOutput(false);

    printPluginInstallOutcome(output, { kind: "picked", installed: ["one", "two"] });

    expect(output.at("success")).toEqual(["Installed 2 plugin(s): one, two"]);
  });

  it("names no plugin for a local install, which carries none", () => {
    const output = new CapturingOutput(false);

    printPluginInstallOutcome(output, { kind: "local", installed: [] });

    expect(output.at("success")).toEqual(["Plugin added successfully."]);
  });

  it("quotes the single plugin a marketplace install brought in", () => {
    const output = new CapturingOutput(false);

    printPluginInstallOutcome(output, { kind: "marketplace", installed: ["aidd-dev"] });

    expect(output.at("success")).toEqual(["Installed 'aidd-dev'."]);
  });
});

describe("printPluginSearchHits", () => {
  it("says there is no match rather than printing nothing", () => {
    const output = new CapturingOutput(false);

    printPluginSearchHits(output, []);

    expect(output.captured).toEqual([{ level: "info", message: "No matches." }]);
  });

  it("prints a hit with its version, description and marketplace", () => {
    const output = new CapturingOutput(false);

    printPluginSearchHits(output, [
      {
        entry: {
          name: "widget",
          version: "1.2.3",
          description: "does widgets",
          source: { kind: "local", path: "/tmp/widget" },
          recommended: false,
          strict: false,
        },
        marketplace: marketplace("acme"),
      },
    ]);

    expect(output.captured).toEqual([
      { level: "print", message: "widget@1.2.3 — does widgets — marketplace: acme" },
    ]);
  });

  it("marks a recommended hit and falls back to ? for a version it has none of", () => {
    const output = new CapturingOutput(false);

    printPluginSearchHits(output, [
      {
        entry: {
          name: "widget",
          source: { kind: "local", path: "/tmp/widget" },
          recommended: true,
          strict: false,
        },
        marketplace: marketplace("acme"),
      },
    ]);

    expect(output.captured).toEqual([
      { level: "print", message: "widget@? —  — marketplace: acme (recommended)" },
    ]);
  });
});

describe("printPluginsUpdated", () => {
  it("reports everything current when nothing moved", () => {
    const output = new CapturingOutput(false);

    printPluginsUpdated(output, []);

    expect(output.at("success")).toEqual(["All plugins are up to date."]);
  });

  it("names what moved, comma separated", () => {
    const output = new CapturingOutput(false);

    printPluginsUpdated(output, ["one", "two"]);

    expect(output.at("success")).toEqual(["Updated: one, two."]);
  });
});

describe("printPluginRemoved", () => {
  it("quotes the plugin that was removed", () => {
    const output = new CapturingOutput(false);

    printPluginRemoved(output, "aidd-dev");

    expect(output.at("success")).toEqual(["Plugin 'aidd-dev' removed."]);
  });
});
