#!/usr/bin/env node
// Keeps SKILL.md frontmatter argument-hint values in sync with action file names.
// Omits the field when a skill has zero or one action.
// Usage:
//   node scripts/sync-skill-argument-hints.mjs           # rewrite stale files
//   node scripts/sync-skill-argument-hints.mjs --check   # exit 1 if stale

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PLUGINS_DIR = path.join(ROOT, "plugins");
const CHECK = process.argv.includes("--check");

function actionName(file) {
  return path.basename(file, path.extname(file)).replace(/^\d+-/, "");
}

async function existsDir(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function collectMarkdownFiles(dir) {
  const entries = await existsDir(dir);
  if (!entries) return [];

  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function skillDirs() {
  const plugins = await existsDir(PLUGINS_DIR);
  if (!plugins) return [];

  const dirs = [];
  for (const plugin of plugins) {
    if (!plugin.isDirectory()) continue;
    const skillsDir = path.join(PLUGINS_DIR, plugin.name, "skills");
    const skills = await existsDir(skillsDir);
    if (!skills) continue;
    for (const skill of skills) {
      if (skill.isDirectory()) dirs.push(path.join(skillsDir, skill.name));
    }
  }
  return dirs.sort((a, b) => a.localeCompare(b));
}

function splitFrontmatter(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  return {
    frontmatter: content.slice(4, end),
    body: content.slice(end),
  };
}

function syncArgumentHint(content, hint) {
  const parts = splitFrontmatter(content);
  if (!parts) return content;

  const lines = parts.frontmatter.split("\n");
  const index = lines.findIndex((value) => value.startsWith("argument-hint:"));
  if (!hint) {
    if (index !== -1) lines.splice(index, 1);
    return `---\n${lines.join("\n")}${parts.body}`;
  }

  const line = `argument-hint: ${hint}`;
  if (index === -1) {
    const descriptionIndex = lines.findIndex((value) => value.startsWith("description:"));
    const insertAt = descriptionIndex === -1 ? lines.length : descriptionIndex + 1;
    lines.splice(insertAt, 0, line);
  } else {
    lines[index] = line;
  }

  return `---\n${lines.join("\n")}${parts.body}`;
}

// Skills whose argument-hint is written by hand, because it names the user's
// entrypoint or cases rather than one token per action. The hook leaves these
// untouched. This is the base pattern for a pipeline or case-based router.
const MANUAL_ARGUMENT_HINT = new Set(["01-brainstorm", "02-project-memory", "04-skill-generate"]);

const stale = [];
for (const dir of await skillDirs()) {
  if (MANUAL_ARGUMENT_HINT.has(path.basename(dir))) continue;
  const skillPath = path.join(dir, "SKILL.md");
  const actionFiles = await collectMarkdownFiles(path.join(dir, "actions"));
  const names = [...new Set(actionFiles.map(actionName))];
  const hint = names.length > 1 ? names.join(" | ") : null;
  const before = await readFile(skillPath, "utf8");
  const after = syncArgumentHint(before, hint);
  if (after !== before) {
    const relative = path.relative(ROOT, skillPath);
    stale.push(relative);
    if (!CHECK) await writeFile(skillPath, after);
  }
}

if (stale.length > 0) {
  if (CHECK) {
    console.error(`Stale argument-hint frontmatter:\n${stale.join("\n")}`);
    console.error("Run: node scripts/sync-skill-argument-hints.mjs");
    process.exit(1);
  }
  console.log(`Synced argument-hint frontmatter in ${stale.length} SKILL.md file(s).`);
} else {
  console.log("All skill argument-hint frontmatter values are current.");
}
