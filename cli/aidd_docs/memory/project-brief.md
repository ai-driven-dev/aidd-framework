# Project Brief

What this package is, the problem it solves, and its domain language.

## What it is

- The `aidd` binary, published as `@ai-driven-dev/cli`. It installs the AIDD framework into a project, per AI coding tool.
- For a developer already working with an assistant daily, who wants the same setup on every tool and every machine.

## Why it exists

- One canonical framework, five tools that each read a different shape. Written once, translated per tool, rather than one prompt library per assistant.
- Every file it writes is tracked, so drift is visible and repairable instead of discovered by hand.
- A session's cost is only knowable from the files the tools already wrote. Nothing else reads them.

## Domain language

| Term | Meaning |
| ---- | ------- |
| Framework | the canonical set of agents, commands, rules, skills, templates |
| Distribution | what one tool gets: the framework rewritten to that tool's conventions |
| Manifest | `.aidd/manifest.json`, every installed file with its hash; each plugin also carries the `scope` (`project` \| `user`) its files were installed at |
| Drift | an installed file changed since it was written |
| Plugin | capability files grouped under one name, installed per tool from a marketplace |
| Marketplace | where plugins come from, registered per project or per machine |
| Context | a bounded area of this codebase; the unit that owns a concern |
| Capability | what a tool declares it can host — hooks, mcp, plugins, settings |
| Record | one measured figure for one session, stored per machine |
| Run journal | what a session did, written into the project by a hook |
| Attribution | how strongly a figure is tied to a person, a task or a step |

## Key features

- Install, update and remove the framework for a tool, and repair what drifted.
- Install plugins from a marketplace, driving a tool's own CLI where its project files are inert.
- Translate an arbitrary source into a target-native plugin tree, recording nothing.
- Measure what sessions cost, from local files, with no service and no upload.
