#!/usr/bin/env node
/**
 * Syncs the project memory block in a project's AI context files: root memory files as
 * always-loaded references, `internal/` and `external/` as a read-on-demand list.
 *
 * Only Claude Code resolves the `@` import form, so AGENTS.md and the copilot instructions
 * take a markdown link, where an `@` line would be inert text loading nothing.
 *
 * With no argument it fills every context file present; named tools narrow it, so a file the
 * user never picked keeps its block untouched. It only ever fills a block already there.
 */

const DOCS_DIR = "aidd_docs";
const MEMORY_SUBDIR = "memory";
const ON_DEMAND_DIRS = ["internal", "external"];
// Comment markers, not a bare tag: a bare tag opens an HTML block running to the next blank
// line, and a context loader skips an @import inside one, so the memory never loads.
const BLOCK_OPEN = "<!-- aidd_project_memory:start -->";
const BLOCK_CLOSE = "<!-- aidd_project_memory:end -->";

// A block written with these is rewritten on the next run: unmigrated, it stops matching and
// the file is skipped with no output at all.
const LEGACY_BLOCK_OPEN = "<aidd_project_memory>";
const LEGACY_BLOCK_CLOSE = "</aidd_project_memory>";
const ON_DEMAND_NOTE = "<!-- read on demand, not auto-loaded -->";
const EXCLUDED_FILES = new Set([".gitkeep", "README.md"]);

// The list between these markers is refreshed; the rest of the file is hand-written.
const MEMORY_README = "README.md";
const TOC_OPEN = "<!-- files:start -->";
const TOC_CLOSE = "<!-- files:end -->";

const TARGET_FILES = [
  { path: "CLAUDE.md", syntax: "at" },
  { path: "AGENTS.md", syntax: "link" },
  { path: ".github/copilot-instructions.md", syntax: "link" },
];

// Mirrors the skill's references/tools.md.
const TOOL_FILES = {
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
  cursor: "AGENTS.md",
  opencode: "AGENTS.md",
  copilot: ".github/copilot-instructions.md",
};

function memoryPath(path, ...parts) {
  return path.join(DOCS_DIR, MEMORY_SUBDIR, ...parts);
}

// Opening directly rather than checking existence first touches the file once, so no
// time-of-check/time-of-use race. A real error still throws.
function readTextOrNull(fs, filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// Single-touch, like readTextOrNull: no existence check before reading.
function readDirOrEmpty(fs, dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

function scanRootFiles(fs, path) {
  return readDirOrEmpty(fs, memoryPath(path))
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !EXCLUDED_FILES.has(e.name))
    .map((e) => memoryPath(path, e.name))
    .sort();
}

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

// A markdown link resolves against the file holding it, so it climbs out of that file's own
// directory. Derived from the target's depth: hardcoding one level made every root-level
// link point outside the repository.
function relativePrefix(targetPath) {
  return "../".repeat(targetPath.split("/").length - 1);
}

function buildReference(syntax, filePath, prefix) {
  const rel = filePath.replace(/\\/g, "/");
  return syntax === "link" ? `[${rel}](${prefix}${rel})` : `@${rel}`;
}

function buildBlockContent(rootFiles, onDemandFiles, syntax, prefix = "") {
  const lines = [];
  for (const f of rootFiles) lines.push(buildReference(syntax, f, prefix));
  if (onDemandFiles.length > 0) {
    lines.push("", ON_DEMAND_NOTE);
    for (const f of onDemandFiles) lines.push(`- ${f.replace(/\\/g, "/")}`);
  }
  if (lines.length === 0) return "\n";
  // A blank line on each side: a context loader treating any `<` line as an HTML block
  // running to the next blank line would otherwise swallow the imports.
  return `\n\n${lines.join("\n")}\n\n`;
}

// Markers that each own their line, outside any code fence. Substring search would cut on
// the quoted marker every upgrade note carries, mangling prose and missing the real block.
function findBlockLines(lines, open, close) {
  let fence = null;
  let openLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const opener = /^(`{3,}|~{3,})/u.exec(trimmed);

    if (fence !== null) {
      // A fence closes only on the same character, repeated at least as often,
      // so a ``` inside a ```` example does not end it early.
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
      continue;
    }
    if (opener) {
      fence = opener[1];
      continue;
    }
    if (trimmed === open) openLine = i;
    else if (trimmed === close && openLine !== -1) return { openLine, closeLine: i };
  }

  return null;
}

function updateMarkers(content, open, close, innerContent) {
  const lines = content.split("\n");
  const found = findBlockLines(lines, open, close);
  if (found === null) return null;

  return (
    lines.slice(0, found.openLine + 1).join("\n") +
    innerContent +
    lines.slice(found.closeLine).join("\n")
  );
}

function migrateLegacyMarkers(content) {
  const lines = content.split("\n");
  const found = findBlockLines(lines, LEGACY_BLOCK_OPEN, LEGACY_BLOCK_CLOSE);
  if (found === null) return content;

  lines[found.openLine] = lines[found.openLine].replace(LEGACY_BLOCK_OPEN, BLOCK_OPEN);
  lines[found.closeLine] = lines[found.closeLine].replace(LEGACY_BLOCK_CLOSE, BLOCK_CLOSE);
  return lines.join("\n");
}

// One marker without its pair can never be filled again, and silence about a block that
// does not sync is what keeps memory unloaded.
function reportUnpairedMarkers(filePath, content) {
  const has = (marker) => content.includes(marker);
  const unpaired =
    has(BLOCK_OPEN) !== has(BLOCK_CLOSE) ||
    has(LEGACY_BLOCK_OPEN) !== has(LEGACY_BLOCK_CLOSE);

  if (unpaired) {
    console.error(`update_memory: ${filePath} has an unpaired project memory marker, not synced`);
  }
  return unpaired;
}

function updateBlock(content, innerContent) {
  return updateMarkers(content, BLOCK_OPEN, BLOCK_CLOSE, innerContent);
}

// memory/-relative path, e.g. aidd_docs/memory/internal/x.md -> internal/x.md.
function memoryRelative(path, filePath) {
  return filePath.replace(/\\/g, "/").replace(`${memoryPath(path)}/`, "");
}

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

// No tool named means every target present, which is what the auto hook wants; tools named
// means only theirs.
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

// Runs as a script, never imported, with every dependency pulled in through dynamic
// import(): the file is copied into a user's project, so a project declaring
// "type": "module" decides how it is parsed and CommonJS syntax would crash it on load.
(async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const childProcess = await import("node:child_process");

  // Every path below is project-relative: without this anchor a run started elsewhere finds
  // no bank and exits 0, which reads as success.
  const root = process.env.CLAUDE_PROJECT_DIR;
  if (root && fs.existsSync(root)) process.chdir(root);

  if (!fs.existsSync(DOCS_DIR)) process.exit(0);

  const tools = process.argv.slice(2).map((arg) => arg.toLowerCase());
  const targets = resolveTargets(tools);

  const rootFiles = scanRootFiles(fs, path);
  const onDemandFiles = ON_DEMAND_DIRS.flatMap((sub) => scanSubdir(fs, path, sub));
  const changed = [];
  let unpaired = false;

  for (const target of targets) {
    const original = readTextOrNull(fs, target.path);
    if (original === null) continue;

    const innerContent = buildBlockContent(
      rootFiles,
      onDemandFiles,
      target.syntax,
      relativePrefix(target.path),
    );
    // Compared against what is on disk, not against the migrated text: an unchanged memory
    // list would otherwise skip the write and leave the old markers in place forever.
    const updated = updateBlock(migrateLegacyMarkers(original), innerContent);

    if (updated === null) {
      if (reportUnpairedMarkers(target.path, original)) unpaired = true;
      continue;
    }
    if (updated === original) continue;

    fs.writeFileSync(target.path, updated, "utf8");
    changed.push(target.path);
  }

  // Only if the README opts in with its own markers.
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

  // Only as the auto hook, which owns no other change: called by the skill, staging its own
  // two files would leave a partial index that reads like the whole change.
  if (changed.length > 0 && tools.length === 0) gitAdd(childProcess, changed);

  // Only when tools were named, so the skill's sync action can stop: the auto hook must
  // never fail a session start over a file the user has yet to repair.
  if (unpaired && tools.length > 0) process.exit(1);
})();
