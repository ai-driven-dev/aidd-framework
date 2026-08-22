#!/usr/bin/env node
// Keeps the hand-typed counts in README.md in sync with the filesystem so they
// can never silently drift. Computes: total plugins, total skills, total agents,
// and per-plugin skill counts, then rewrites README.md in place.
//
//   node scripts/sync-readme-counts.mjs           # rewrite README.md
//   node scripts/sync-readme-counts.mjs --check    # exit 1 if README is stale (CI)
//
// Hero counts live between <!--counts:start--> and <!--counts:end-->.
// Per-plugin counts are the `N skill(s)` code-span after each plugin heading.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const README = ROOT + "README.md";
const PLUGINS = ROOT + "plugins";

const dirs = (p) =>
  existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
const files = (p) =>
  existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name) : [];

const plugins = dirs(PLUGINS).sort();
// A directory under skills/ is a skill only once it carries a SKILL.md - the same test
// the CLI's own plugin-source-tree-reader.ts uses. Without it, a plugin-wide directory
// like aidd-telemetry's skills/_shared/ (shared code, no SKILL.md) counts as a skill.
const skillsOf = (name) =>
  dirs(`${PLUGINS}/${name}/skills`).filter((skill) =>
    existsSync(`${PLUGINS}/${name}/skills/${skill}/SKILL.md`)
  ).length;
const agentsOf = (name) => files(`${PLUGINS}/${name}/agents`).filter((f) => f.endsWith(".md")).length;

const totalPlugins = plugins.length;
const totalSkills = plugins.reduce((n, p) => n + skillsOf(p), 0);
const totalAgents = plugins.reduce((n, p) => n + agentsOf(p), 0);

let md = readFileSync(README, "utf8");
const before = md;

// 1. Hero counts (between markers).
const hero = `<kbd>${totalPlugins} plugins</kbd> · <kbd>${totalSkills} skills</kbd> · <kbd>${totalAgents} agents</kbd>`;
md = md.replace(/<!--counts:start-->[\s\S]*?<!--counts:end-->/, `<!--counts:start-->${hero}<!--counts:end-->`);

// 2. Per-plugin `N skill(s)` after each plugin heading link.
for (const name of plugins) {
  const n = skillsOf(name);
  const word = n === 1 ? "skill" : "skills";
  // Match the plugin heading link, then the first `\d+ skill(s)` code-span within ~140 chars.
  const re = new RegExp(
    `(\\[${name}\\]\\(plugins/${name}/README\\.md\\)[\\s\\S]{0,140}?\`)\\d+\\s+skills?(\`)`,
  );
  md = md.replace(re, `$1${n} ${word}$2`);
}

if (md === before) {
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.error("README counts are stale. Run: node scripts/sync-readme-counts.mjs");
  process.exit(1);
}

writeFileSync(README, md);
console.log(`README counts synced: ${totalPlugins} plugins, ${totalSkills} skills, ${totalAgents} agents.`);
