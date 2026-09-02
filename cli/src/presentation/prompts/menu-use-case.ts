import type { ManifestRepository } from "../../contexts/framework/domain/ports/manifest-repository.js";
import type { Prompter } from "../../domain/ports/prompter.js";

interface MenuLeaf {
  name: string;
  value: string;
  description?: string;
  command: string[];
  inputPrompt?: string;
  commandSuffix?: string[];
}

interface MenuBranch {
  name: string;
  value: string;
  description?: string;
  children: MenuNode[];
}

type MenuNode = MenuLeaf | MenuBranch;

function isBranch(node: MenuNode): node is MenuBranch {
  return "children" in node;
}

function toChoice(node: MenuNode): { name: string; value: string; description?: string } {
  return { name: node.name, value: node.value, description: node.description };
}

const INSTALLED_NODES: MenuNode[] = [
  {
    name: "Inspect",
    value: "inspect",
    description: "Check status, health and installed items",
    children: [
      {
        name: "Doctor",
        value: "doctor",
        description: "Tool inventory, drift, plugins, and structural health",
        command: ["doctor"],
      },
      {
        name: "Doctor (one tool)",
        value: "doctor-tool",
        description: "Scope the report to a single AI or IDE tool",
        command: ["doctor", "--tool"],
        inputPrompt: "Tool (e.g. claude, cursor, copilot, codex, opencode, vscode)",
      },
      {
        name: "Plugins",
        value: "plugin-list",
        description: "Show installed plugins per tool",
        command: ["plugin", "list"],
      },
    ],
  },
  {
    name: "Manage tools",
    value: "manage-tools",
    description: "Install, remove and update AI or IDE tools",
    children: [
      {
        name: "Install",
        value: "framework-install",
        description: "Add a tool to this project",
        command: ["framework", "install", "--tool"],
        inputPrompt: "Tool (e.g. claude, cursor, copilot, codex, opencode, vscode)",
      },
      {
        name: "Remove",
        value: "framework-remove",
        description: "Remove an installed tool",
        command: ["framework", "remove", "--tool"],
        inputPrompt: "Tool to remove",
      },
      {
        name: "Update all",
        value: "framework-update-all",
        description: "Re-install every installed tool's configs from bundled assets",
        command: ["framework", "update"],
      },
      {
        name: "Update one",
        value: "framework-update-one",
        description: "Re-install one tool's configs from bundled assets",
        command: ["framework", "update", "--tool"],
        inputPrompt: "Tool to update",
      },
    ],
  },
  {
    name: "Manage plugins",
    value: "manage-plugins",
    description: "Browse, install and manage AI tool plugins",
    children: [
      {
        name: "Install plugin",
        value: "plugin-install",
        description: "Install a plugin by name, local path, or interactive pick",
        command: ["plugin", "install"],
        inputPrompt: "Plugin name, path, or leave empty for interactive pick",
      },
      {
        name: "Search",
        value: "plugin-search",
        description: "Search plugins across all registered marketplaces",
        command: ["plugin", "search"],
        inputPrompt: "Search query",
      },
      {
        name: "Update",
        value: "plugin-update",
        description: "Update all installed plugins to latest version",
        command: ["plugin", "update"],
      },
      {
        name: "Remove",
        value: "plugin-remove",
        description: "Remove an installed plugin",
        command: ["plugin", "remove"],
        inputPrompt: "Plugin name to remove",
      },
      {
        name: "List",
        value: "plugin-list-2",
        description: "Show all installed plugins per tool",
        command: ["plugin", "list"],
      },
      {
        name: "Doctor",
        value: "plugin-doctor",
        description: "Check one plugin's installation health",
        command: ["doctor", "--plugin"],
        inputPrompt: "Plugin name",
      },
    ],
  },
  {
    name: "Marketplaces",
    value: "marketplaces",
    description: "Manage plugin marketplace registrations",
    children: [
      {
        name: "List",
        value: "marketplace-list",
        description: "Show all registered marketplaces",
        command: ["marketplace", "list"],
      },
      {
        name: "Add",
        value: "marketplace-add",
        description: "Register a new plugin marketplace",
        command: ["marketplace", "add"],
      },
      {
        name: "Refresh",
        value: "marketplace-refresh",
        description: "Refresh all registered marketplaces",
        command: ["marketplace", "refresh"],
      },
      {
        name: "Remove",
        value: "marketplace-remove",
        description: "Unregister a marketplace",
        command: ["marketplace", "remove"],
        inputPrompt: "Marketplace name to remove",
      },
      {
        name: "Check freshness",
        value: "marketplace-check",
        description: "Report stale marketplaces",
        command: ["marketplace", "check"],
      },
    ],
  },
  {
    name: "Maintain & repair",
    value: "maintain",
    description: "Update tools, sync tracked files, and clean everything",
    children: [
      {
        name: "Update all tools",
        value: "framework-update-maintain",
        description: "Re-install every installed tool's configs from bundled assets",
        command: ["framework", "update"],
      },
      {
        name: "Sync everything",
        value: "sync-all",
        description: "Regenerate tracked files across all installed tools, driven by the manifest",
        command: ["sync"],
      },
      {
        name: "Clean (nuke .aidd)",
        value: "clean",
        description: "Remove all AIDD-managed files from this project",
        command: ["clean"],
      },
    ],
  },
  {
    name: "System",
    value: "system",
    description: "CLI update and authentication",
    children: [
      {
        name: "Update CLI",
        value: "self-update",
        description: "Update the AIDD CLI binary itself (bare `update`)",
        command: ["update"],
      },
      {
        name: "Authentication",
        value: "auth",
        description: "Manage authentication credentials",
        children: [
          {
            name: "Status",
            value: "auth-status",
            description: "Show current authentication status",
            command: ["auth", "status"],
          },
          {
            name: "Login",
            value: "auth-login",
            description: "Authenticate with your credentials",
            command: ["auth", "login"],
          },
          {
            name: "Logout",
            value: "auth-logout",
            description: "Remove stored credentials",
            command: ["auth", "logout"],
          },
        ],
      },
    ],
  },
];

const BACK = { name: "← Back", value: "back" } as const;
const EXIT = { name: "Exit", value: "exit" } as const;

type NavResult = { type: "command"; command: string[] } | { type: "back" } | { type: "exit" };

export type InteractiveMenuOptions = Record<never, never>;

export interface InteractiveMenuResult {
  command: string[];
}

export class InteractiveMenuUseCase {
  constructor(
    private readonly manifestRepo: ManifestRepository,
    private readonly prompter: Prompter
  ) {}

  async execute(_options?: InteractiveMenuOptions): Promise<InteractiveMenuResult> {
    const manifest = await this.manifestRepo.load();
    if (manifest === null) return this.handleFreshInstall();
    const result = await this.showMenu(INSTALLED_NODES, "What would you like to do?", []);
    if (result.type !== "command") return { command: ["exit"] };
    return { command: result.command };
  }

  private async handleFreshInstall(): Promise<InteractiveMenuResult> {
    const confirmed = await this.prompter.confirm("AIDD not initialized. Run setup now?", true);
    return { command: confirmed ? ["setup"] : ["exit"] };
  }

  private async showMenu(
    nodes: MenuNode[],
    label: string,
    breadcrumb: string[]
  ): Promise<NavResult> {
    const nav = breadcrumb.length > 0 ? [BACK, EXIT] : [EXIT];
    const picked = await this.prompter.select<string>(label, [...nodes.map(toChoice), ...nav]);
    if (picked === "exit") return { type: "exit" };
    if (picked === "back") return { type: "back" };

    const node = nodes.find((n) => n.value === picked);
    if (!node) return { type: "exit" };
    if (isBranch(node)) {
      const result = await this.showMenu(node.children, node.name, [...breadcrumb, node.value]);
      if (result.type === "back") return this.showMenu(nodes, label, breadcrumb);
      return result;
    }

    return { type: "command", command: await this.resolveCommand(node) };
  }

  private async resolveCommand(node: MenuLeaf): Promise<string[]> {
    if (node.inputPrompt !== undefined) {
      const input = await this.prompter.input(node.inputPrompt);
      return [...node.command, input, ...(node.commandSuffix ?? [])];
    }
    return node.command;
  }
}
