#!/usr/bin/env node
// NOTE: synced from plugins/aidd-dev/scripts/list-rules.mjs. Keep in sync when the source changes.
/**
 * list-rules.mjs
 *
 * Inventory project rules across every installed AI tool surface.
 *
 * Tools and locations (see references/ai-mapping.md):
 *   - Claude Code:    .claude/rules/**\/*.md
 *   - Cursor:         .cursor/rules/**\/*.mdc
 *   - GitHub Copilot: .github/instructions/**\/*.instructions.md
 *   - OpenCode:       .opencode/rules/**\/*.md       (no frontmatter; name from filename)
 *   - Gemini CLI:     .gemini/rules/**\/*.md         (no native rules surface; scanned only if a project made one)
 *   - Codex CLI:      rules not supported, skipped
 *
 * Frontmatter shapes differ per tool. The script normalises every entry to:
 *   { tool, path, name, description, paths }
 *
 *   - tool        : claude | cursor | copilot | opencode | gemini
 *   - path        : path relative to --root (defaults to cwd)
 *   - name        : derived from the filename (without extension)
 *   - description : frontmatter `description` (Cursor, Copilot) or empty for OpenCode/Claude when absent
 *   - paths       : merged glob list from `paths` (Claude), `globs` (Cursor), `applyTo` (Copilot)
 *
 * Exit code 0; empty array when no tool dir contains rules.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { argv, cwd, exit, stderr, stdout } from 'node:process';

const TOOL_TARGETS = [
  { tool: 'claude', dir: '.claude/rules', ext: '.md' },
  { tool: 'cursor', dir: '.cursor/rules', ext: '.mdc' },
  { tool: 'copilot', dir: '.github/instructions', ext: '.instructions.md' },
  { tool: 'opencode', dir: '.opencode/rules', ext: '.md' },
  { tool: 'gemini', dir: '.gemini/rules', ext: '.md' },
];

function parseArgs(args) {
  let root = cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root' && args[i + 1]) {
      root = resolve(args[i + 1]);
      i++;
    }
  }
  return { root };
}

async function walk(dir, ext) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full, ext)));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

function extractFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;
  return content.slice(4, end).replace(/^\n/, '');
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineList(value) {
  if (!value.startsWith('[') || !value.endsWith(']')) return null;
  const inner = value.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map((part) => stripQuotes(part.trim()));
}

function stripInlineComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function parseFrontmatter(raw) {
  const fm = {};
  let currentKey = null;
  let listAcc = null;
  for (const rawLine of raw.split('\n')) {
    const line = stripInlineComment(rawLine);
    if (!line.trim()) continue;

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey && listAcc) {
      listAcc.push(stripQuotes(listItem[1].trim()));
      continue;
    }

    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    if (value === '') {
      currentKey = key;
      listAcc = [];
      fm[key] = listAcc;
    } else {
      const inlineList = parseInlineList(value);
      fm[key] = inlineList !== null ? inlineList : stripQuotes(value);
      currentKey = null;
      listAcc = null;
    }
  }
  return fm;
}

function nameFromPath(relativePath, ext) {
  const base = relativePath.split('/').pop();
  return base.endsWith(ext) ? base.slice(0, -ext.length) : base;
}

function normaliseGlobs(fm) {
  const out = [];
  if (Array.isArray(fm.paths)) out.push(...fm.paths);
  if (Array.isArray(fm.globs)) out.push(...fm.globs);
  if (typeof fm.applyTo === 'string' && fm.applyTo.trim()) out.push(fm.applyTo.trim());
  return out;
}

async function inventoryTool(root, target) {
  const absolute = join(root, target.dir);
  if (!existsSync(absolute)) return [];

  const dirStat = await stat(absolute).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) return [];

  const files = await walk(absolute, target.ext);
  const entries = [];

  for (const file of files) {
    const relPath = relative(root, file);
    const content = await readFile(file, 'utf8');
    const rawFm = extractFrontmatter(content);
    const fm = rawFm ? parseFrontmatter(rawFm) : {};

    const entry = {
      tool: target.tool,
      path: relPath,
      name: nameFromPath(relPath, target.ext),
      description: typeof fm.description === 'string' ? fm.description : '',
    };

    const paths = normaliseGlobs(fm);
    if (paths.length > 0) entry.paths = paths;
    entries.push(entry);
  }

  return entries;
}

async function main() {
  const { root } = parseArgs(argv.slice(2));

  const aggregated = [];
  for (const target of TOOL_TARGETS) {
    const entries = await inventoryTool(root, target);
    aggregated.push(...entries);
  }

  stdout.write(JSON.stringify(aggregated, null, 2) + '\n');
}

main().catch((err) => {
  stderr.write(`error: ${err.message}\n`);
  exit(1);
});
