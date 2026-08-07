#!/usr/bin/env node
// Checks SKILL.md frontmatter against R4 of the skill contract:
// argument-hint names what the user brings, never the action slugs, always present.
// The contract lives in
// plugins/aidd-context/skills/04-skill-generate/references/skill-authoring.md
// Usage:
//   node scripts/check-skill-argument-hints.mjs   # exit 1 on any breach

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PLUGINS_DIR = path.join(ROOT, "plugins");

function actionName(file) {
  return path.basename(file, path.extname(file)).replace(/^\d+-/, "");
}

async function entriesOf(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function collectMarkdownFiles(dir) {
  const entries = await entriesOf(dir);
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
  const plugins = await entriesOf(PLUGINS_DIR);
  if (!plugins) return [];

  const dirs = [];
  for (const plugin of plugins) {
    if (!plugin.isDirectory()) continue;
    const skills = await entriesOf(path.join(PLUGINS_DIR, plugin.name, "skills"));
    if (!skills) continue;
    for (const skill of skills) {
      if (skill.isDirectory()) dirs.push(path.join(PLUGINS_DIR, plugin.name, "skills", skill.name));
    }
  }
  return dirs.sort((a, b) => a.localeCompare(b));
}

function argumentHint(content) {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const line = content
    .slice(4, end)
    .split("\n")
    .find((value) => value.startsWith("argument-hint:"));
  return line ? line.slice("argument-hint:".length).trim() : null;
}

async function takesInput(actionFiles) {
  for (const file of actionFiles) {
    const body = await readFile(file, "utf8");
    if (/^## Input$/m.test(body)) return true;
  }
  return actionFiles.length === 0;
}

const breaches = [];
for (const dir of await skillDirs()) {
  const skillPath = path.join(dir, "SKILL.md");
  const content = await readFile(skillPath, "utf8").catch(() => null);
  if (content === null) continue;

  const relative = path.relative(ROOT, skillPath);
  const hint = argumentHint(content);
  const actionFiles = await collectMarkdownFiles(path.join(dir, "actions"));

  if (!hint) {
    if (await takesInput(actionFiles)) {
      breaches.push(`${relative}: no argument-hint. Name what the user brings.`);
    }
    continue;
  }

  const slugs = [...new Set(actionFiles.map(actionName))].join(" | ");
  if (slugs && hint === slugs) {
    breaches.push(`${relative}: argument-hint repeats the action slugs. Name what the user brings.`);
  }
}

if (breaches.length > 0) {
  console.error(`argument-hint breaches R4 of the skill contract:\n${breaches.join("\n")}`);
  console.error("Contract: plugins/aidd-context/skills/04-skill-generate/references/skill-authoring.md");
  process.exit(1);
}

console.log("Every skill names what the user brings.");
