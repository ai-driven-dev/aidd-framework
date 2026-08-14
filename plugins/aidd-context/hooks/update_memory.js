#!/usr/bin/env node
/**
 * update_memory.js - Syncs the <aidd_project_memory> block in AI context files.
 *
 * Scans aidd_docs/memory/ and updates the <aidd_project_memory> block in each
 * context file with two tiers:
 *   - Root memory files       -> always loaded, via a tool-appropriate reference.
 *   - internal/ and external/ -> listed (plain paths, no @), read on demand.
 *
 * Reference syntax for the always-loaded tier:
 *   CLAUDE.md / AGENTS.md        -> @aidd_docs/memory/file.md
 *   .github/copilot-instructions -> [aidd_docs/memory/file.md](../aidd_docs/memory/file.md)
 *
 * Usage:
 *   node update_memory.js                  every context file already present
 *   node update_memory.js claude codex     only those tools' context files
 *
 * The auto hook calls it with no argument. The project-memory skill passes the
 * tools the user picked, so a context file the user did not choose is left
 * alone even when it exists.
 *
 * It only ever fills a block that is already there. Creating the file, or the
 * block inside it, is the skill's job.
 */

// ── Constants ─────────────────────────────────────────────────────

const DOCS_DIR = "aidd_docs";
const MEMORY_SUBDIR = "memory";
const ON_DEMAND_DIRS = ["internal", "external"];
const BLOCK_OPEN = "<aidd_project_memory>";
const BLOCK_CLOSE = "</aidd_project_memory>";
const ON_DEMAND_NOTE = "<!-- read on demand, not auto-loaded -->";
const EXCLUDED_FILES = new Set([".gitkeep", "README.md"]);

// Human-facing index of the memory bank. The hook refreshes the list between
// these markers; everything else in the file is hand-written and preserved.
const MEMORY_README = "README.md";
const TOC_OPEN = "<!-- files:start -->";
const TOC_CLOSE = "<!-- files:end -->";

const TARGET_FILES = [
  { path: "CLAUDE.md", syntax: "at" },
  { path: "AGENTS.md", syntax: "at" },
  { path: ".github/copilot-instructions.md", syntax: "link" },
];

// Which context file each tool reads. Mirrors the skill's references/tools.md.
const TOOL_FILES = {
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
  cursor: "AGENTS.md",
  opencode: "AGENTS.md",
  copilot: ".github/copilot-instructions.md",
};

// ── Helpers ───────────────────────────────────────────────────────

function memoryPath(path, ...parts) {
  return path.join(DOCS_DIR, MEMORY_SUBDIR, ...parts);
}

// Read a file's text, or null if it does not exist. Opening directly (instead
// of an existsSync check first) avoids a time-of-check/time-of-use race: the
// file is touched exactly once. Real errors (permissions, etc.) still throw.
function readTextOrNull(fs, filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// List a directory, or [] if it does not exist. Same single-touch rationale as
// readTextOrNull: no separate existence check before reading.
function readDirOrEmpty(fs, dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// Top-level .md at the root of memory/ (always-loaded tier).
function scanRootFiles(fs, path) {
  return readDirOrEmpty(fs, memoryPath(path))
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !EXCLUDED_FILES.has(e.name))
    .map((e) => memoryPath(path, e.name))
    .sort();
}

// .md under memory/<sub>/ recursively (on-demand tier).
function scanSubdir(fs, path, sub) {
  const out = [];
  const walk = (dir) => {
    for (const e of readDirOrEmpty(fs, dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".md") && !EXCLUDED_FILES.has(e.name)) out.push(full);
    }
  };
  walk(memoryPath(path, sub));
  return out.sort();
}

function buildReference(syntax, filePath) {
  const rel = filePath.replace(/\\/g, "/");
  return syntax === "link" ? `[${rel}](../${rel})` : `@${rel}`;
}

function buildBlockContent(rootFiles, onDemandFiles, syntax) {
  const lines = [];
  for (const f of rootFiles) lines.push(buildReference(syntax, f));
  if (onDemandFiles.length > 0) {
    lines.push("", ON_DEMAND_NOTE);
    for (const f of onDemandFiles) lines.push(`- ${f.replace(/\\/g, "/")}`);
  }
  if (lines.length === 0) return "";
  return `\n${lines.join("\n")}\n`;
}

// Replace the text between an open and close marker, leaving the rest intact.
// Anchor on the close, then take the nearest open before it: a bare marker
// quoted in hand-written prose above the real block must not become the cut
// point and splice out everything between it and the block.
function updateMarkers(content, open, close, innerContent) {
  const closeIdx = content.indexOf(close);
  if (closeIdx === -1) return null;
  const openIdx = content.lastIndexOf(open, closeIdx);
  if (openIdx === -1) return null;
  return content.slice(0, openIdx + open.length) + innerContent + content.slice(closeIdx);
}

function updateBlock(content, innerContent) {
  return updateMarkers(content, BLOCK_OPEN, BLOCK_CLOSE, innerContent);
}

// memory/-relative path, e.g. aidd_docs/memory/internal/x.md -> internal/x.md.
function memoryRelative(path, filePath) {
  return filePath.replace(/\\/g, "/").replace(`${memoryPath(path)}/`, "");
}

// Human-facing TOC of the memory bank, grouped by load tier.
function buildToc(rootFiles, onDemandFiles, path) {
  const link = (f) => {
    const rel = memoryRelative(path, f);
    return `- [${rel}](${rel})`;
  };
  const lines = rootFiles.map(link);
  if (onDemandFiles.length > 0) {
    lines.push("", "Read on demand:", "", ...onDemandFiles.map(link));
  }
  if (lines.length === 0) lines.push("_No memory files yet._");
  return `\n${lines.join("\n")}\n`;
}

// The context files to fill. No tool named: every target already present, which
// is what the auto hook wants. Tools named: only theirs, so an AGENTS.md the
// user never picked keeps its block untouched.
function resolveTargets(tools) {
  if (tools.length === 0) return TARGET_FILES;

  const unknown = tools.filter((t) => !(t in TOOL_FILES));
  if (unknown.length > 0) {
    const known = Object.keys(TOOL_FILES).join(", ");
    console.error(`update_memory: unknown tool ${unknown.join(", ")} (known: ${known})`);
    process.exit(1);
  }

  const wanted = new Set(tools.map((t) => TOOL_FILES[t]));
  return TARGET_FILES.filter((target) => wanted.has(target.path));
}

function gitAdd(childProcess, files) {
  try {
    childProcess.execSync(`git add ${files.map((f) => `"${f}"`).join(" ")}`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    // silent: no git or not a repo
  }
}

// ── Main ──────────────────────────────────────────────────────────

(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const childProcess = await import("node:child_process");

  // Every path below is project-relative, so anchor on the project root when
  // Claude Code names it. Without this a run started elsewhere finds no bank
  // and exits 0, which reads as success.
  const root = process.env.CLAUDE_PROJECT_DIR;
  if (root && fs.existsSync(root)) process.chdir(root);

  if (!fs.existsSync(DOCS_DIR)) process.exit(0);

  const tools = process.argv.slice(2).map((arg) => arg.toLowerCase());
  const targets = resolveTargets(tools);

  const rootFiles = scanRootFiles(fs, path);
  const onDemandFiles = ON_DEMAND_DIRS.flatMap((sub) => scanSubdir(fs, path, sub));
  const changed = [];

  for (const target of targets) {
    const original = readTextOrNull(fs, target.path);
    if (original === null) continue;

    const innerContent = buildBlockContent(rootFiles, onDemandFiles, target.syntax);
    const updated = updateBlock(original, innerContent);

    if (updated === null || updated === original) continue;

    fs.writeFileSync(target.path, updated, "utf8");
    changed.push(target.path);
  }

  // Refresh the human-facing TOC in memory/README.md, only if it opts in with markers.
  const readmePath = memoryPath(path, MEMORY_README);
  const readmeOriginal = readTextOrNull(fs, readmePath);
  if (readmeOriginal !== null) {
    const toc = buildToc(rootFiles, onDemandFiles, path);
    const updated = updateMarkers(readmeOriginal, TOC_OPEN, TOC_CLOSE, toc);
    if (updated !== null && updated !== readmeOriginal) {
      fs.writeFileSync(readmePath, updated, "utf8");
      changed.push(readmePath);
    }
  }

  // Stage only when running as the auto hook, which owns no other change. Called
  // by the skill, generate has just written files this script knows nothing about,
  // so staging its own two would leave a partial index that reads like the whole
  // change. The skill reports instead, and the user stages what they mean to commit.
  if (changed.length > 0 && tools.length === 0) gitAdd(childProcess, changed);
})();
