# Changelog

## [2.4.2](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.4.1...aidd-pm-v2.4.2) (2026-08-14)


### Refactoring

* **aidd-pm:** migrate ticket-info, prd, and spec to router contract ([#628](https://github.com/ai-driven-dev/framework/issues/628)) ([f6539e2](https://github.com/ai-driven-dev/framework/commit/f6539e2c1d6564edf55b6fea983acd6362d2dd7e))

## [2.4.1](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.4.0...aidd-pm-v2.4.1) (2026-08-07)


### Refactoring

* **framework:** one home for the skill contract ([#601](https://github.com/ai-driven-dev/framework/issues/601)) ([415a777](https://github.com/ai-driven-dev/framework/commit/415a77706c84277036dc7470d6dc329f9abde1de))

## [2.4.0](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.3.0...aidd-pm-v2.4.0) (2026-08-06)


### Features

* **aidd-pm:** keep a typed product backlog coherent whoever writes to it ([#582](https://github.com/ai-driven-dev/framework/issues/582)) ([fe0eebc](https://github.com/ai-driven-dev/framework/commit/fe0eebc5cf142e6668859f83dfe7ae4a38097435))


### Refactoring

* **plugins:** action citations use markdown links, not @ ([c5da712](https://github.com/ai-driven-dev/framework/commit/c5da7126ef30354e17d4665300bd88481fc7c816))

## [2.3.0](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.2.1...aidd-pm-v2.3.0) (2026-07-31)


### Features

* **aidd-pm:** add evidence-bounded spike skill ([#543](https://github.com/ai-driven-dev/framework/issues/543)) ([16e5bfa](https://github.com/ai-driven-dev/framework/commit/16e5bfa59e70acc6692749089c2423c5a7efbe86)), closes [#412](https://github.com/ai-driven-dev/framework/issues/412)
* **aidd-pm:** add Product Brief discovery skill ([#551](https://github.com/ai-driven-dev/framework/issues/551)) ([d5e7224](https://github.com/ai-driven-dev/framework/commit/d5e72243f683bc57ea439f2571b410df8b332d69)), closes [#349](https://github.com/ai-driven-dev/framework/issues/349)

## [2.2.1](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.2.0...aidd-pm-v2.2.1) (2026-07-10)


### Refactoring

* remove per-skill README.md mirrors ([#302](https://github.com/ai-driven-dev/framework/issues/302)) ([#396](https://github.com/ai-driven-dev/framework/issues/396)) ([1b94c3c](https://github.com/ai-driven-dev/framework/commit/1b94c3c0108c21eacfacf63f55fa7a24dc79d8dd))

## [2.2.0](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.1.1...aidd-pm-v2.2.0) (2026-07-06)


### Features

* **framework:** read action files before running, across all skills ([#389](https://github.com/ai-driven-dev/framework/issues/389)) ([9d592a6](https://github.com/ai-driven-dev/framework/commit/9d592a6d8c1ca3d0ac8f8aaf54e30e7186a8eb48))

## [2.1.1](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.1.0...aidd-pm-v2.1.1) (2026-07-01)


### Refactoring

* **framework:** strict anti-slop templates and review redesign ([153ba42](https://github.com/ai-driven-dev/framework/commit/153ba42faff9177c66ebb97de4ea8d7512fc5b85))

## [2.1.0](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v2.0.0...aidd-pm-v2.1.0) (2026-06-30)


### Features

* **skills:** sync argument hints ([#296](https://github.com/ai-driven-dev/framework/issues/296)) ([5aa9216](https://github.com/ai-driven-dev/framework/commit/5aa92166cc80d74c79a1dab183224517c3fb1f49))


### Refactoring

* **aidd-dev:** redesign 01-plan into gather/explore/wireframe/plan ([#271](https://github.com/ai-driven-dev/framework/issues/271)) ([dba017e](https://github.com/ai-driven-dev/framework/commit/dba017e8e4c6ef9bc80325791495f1b5fe8c350b)), closes [#292](https://github.com/ai-driven-dev/framework/issues/292) [#265](https://github.com/ai-driven-dev/framework/issues/265) [#276](https://github.com/ai-driven-dev/framework/issues/276)
* conform remaining skills to the authoring contract ([#334](https://github.com/ai-driven-dev/framework/issues/334)) ([dcc232a](https://github.com/ai-driven-dev/framework/commit/dcc232a5a7a7bcdf0c477b36399fd4d412685022))
* **framework:** executor/checker agents + SDLC orchestration redesign ([#314](https://github.com/ai-driven-dev/framework/issues/314)) ([7df7a34](https://github.com/ai-driven-dev/framework/commit/7df7a34dab251cd4190f76bb1cb031584bdea5bd))

## [2.0.0](https://github.com/ai-driven-dev/framework/compare/aidd-pm-v1.0.2...aidd-pm-v2.0.0) (2026-06-19)


### ⚠ BREAKING CHANGES

* **framework:** auto-routing is removed. Skills are now manual-invoke only; the prompt-to-skill routing hint no longer runs.

### Features

* **framework:** remove evals system end-to-end ([#261](https://github.com/ai-driven-dev/framework/issues/261)) ([9a3c1b8](https://github.com/ai-driven-dev/framework/commit/9a3c1b8237359842f3200683732bc73b825582f6))


### Miscellaneous

* **framework:** rename repository URLs aidd-framework to framework ([#266](https://github.com/ai-driven-dev/framework/issues/266)) ([7cfc0a3](https://github.com/ai-driven-dev/framework/commit/7cfc0a3cf5fcd8eb068000744f2854d19624546f))
* **framework:** stop shipping .mcp.json, recommend MCP servers in README ([#263](https://github.com/ai-driven-dev/framework/issues/263)) ([e602fa0](https://github.com/ai-driven-dev/framework/commit/e602fa0c8d49fbbd7d0b65f85a0d5122ee8d9c6c))

## [1.0.2](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-pm-v1.0.1...aidd-pm-v1.0.2) (2026-06-03)


### Bug Fixes

* **framework:** make all 31 skill names spec-compliant (kebab, folder-matched, no colons) ([#172](https://github.com/ai-driven-dev/aidd-framework/issues/172)) ([a47505f](https://github.com/ai-driven-dev/aidd-framework/commit/a47505f5d63e939db0bf28629adbafec888e28e6))

## [1.0.1](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-pm-v1.0.0...aidd-pm-v1.0.1) (2026-05-29)


### Refactoring

* **aidd-context:** unify 03-context-generate on Model Y tool-resolution ([#155](https://github.com/ai-driven-dev/aidd-framework/issues/155)) ([09e3c56](https://github.com/ai-driven-dev/aidd-framework/commit/09e3c564a3c1c12e9915f85dff7902a613919a98))

## [1.0.0](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-pm-v1.0.0...aidd-pm-v1.0.0) (2026-05-19)


### Features

* **aidd-pm:** scaffold RC skills with actions ([22fc883](https://github.com/ai-driven-dev/aidd-framework/commit/22fc88365631718e76e893e41e8789c1bb5da599))
* **framework:** refactor to marketplace plugin architecture and skills ([27128a9](https://github.com/ai-driven-dev/aidd-framework/commit/27128a96314904b7b57b0bc419e4d29b7a7edaf0))
* **framework:** relocate templates and conventions into skill assets ([6920182](https://github.com/ai-driven-dev/aidd-framework/commit/692018202f84cd6f5d885f5737f305f77f79ac5f))
* **framework:** scaffold 4-plugin marketplace catalog ([7be5466](https://github.com/ai-driven-dev/aidd-framework/commit/7be5466ae78f432a5477a6f35d23cbff56b7f2df))
* **framework:** split MCP and SessionStart hook into plugins ([527f9b8](https://github.com/ai-driven-dev/aidd-framework/commit/527f9b8c13ea1c7e45b277218569e6881559cadc))
* **framework:** update build script for plugin layout and regenerate catalogs ([ea18188](https://github.com/ai-driven-dev/aidd-framework/commit/ea1818850a6c9d8b39de2aa5bae2b6ecf6741ddd))


### Bug Fixes

* **framework:** correct slash command naming in docs ([adad60a](https://github.com/ai-driven-dev/aidd-framework/commit/adad60aacaa120f3abf55100625bed7a3a87a50a))
* **framework:** namespace frontmatter for relocated skills ([ea220a1](https://github.com/ai-driven-dev/aidd-framework/commit/ea220a19667da43cbe88c0dca87913b1d1c381cb))
* **framework:** wire SDLC contracts — namespace, plan paths, commit modes, validator semantics ([f5f14e0](https://github.com/ai-driven-dev/aidd-framework/commit/f5f14e01c6bb4a8c7952b6241b89a50816f636a6))


### Miscellaneous

* **ci:** SHA-pin every external action and add CodeQL workflow ([66d5fcf](https://github.com/ai-driven-dev/aidd-framework/commit/66d5fcf99776df2885a84b2ef70943ff63099748))
* **framework:** adopt release-please monorepo with per-plugin versioning ([9706606](https://github.com/ai-driven-dev/aidd-framework/commit/9706606207f1474033fb9b73ce089636362616c9))
* **framework:** bulk alignment — evals everywhere, em-dash purge, audit template, stale refs fixed ([0dfd79d](https://github.com/ai-driven-dev/aidd-framework/commit/0dfd79dac5ce7f15194b4aa9b58b5dd61fdf14b6))
* **framework:** bump aidd-pm to 1.0.0 and apply audit fixes ([97573bc](https://github.com/ai-driven-dev/aidd-framework/commit/97573bcf1b7624f6cf1acaa62791b9cdbe1b237b))
* **framework:** disable proposed MCP servers by default ([785293b](https://github.com/ai-driven-dev/aidd-framework/commit/785293b45eea542712031e326c18ac7454068cbf))
* **framework:** merge feat/plugin-content-tool-agnostic ([11cce19](https://github.com/ai-driven-dev/aidd-framework/commit/11cce1963826a1ed3e28837b9ccee8ed11fe2229))
* **framework:** merge origin/feat/plugin-architecture ([0082b4c](https://github.com/ai-driven-dev/aidd-framework/commit/0082b4cc7916fca6e3060362a0ce762c155a0e19))
* **framework:** regenerate plugin catalogs after audit sweep ([448b111](https://github.com/ai-driven-dev/aidd-framework/commit/448b111662335197c9e4e415db391fc4e8d5c79f))
* **framework:** release as 4.0.0 ([5b0fc9d](https://github.com/ai-driven-dev/aidd-framework/commit/5b0fc9d9116e37abe7ef5dbb5d06438f607475e8))
* **framework:** self-host summarize-markdown.mjs for per-plugin CATALOG ([ee62862](https://github.com/ai-driven-dev/aidd-framework/commit/ee6286237d3b1b97ebaf67aa68f8152015d61e90))
* **framework:** trigger ci recheck after history rewrite ([391760e](https://github.com/ai-driven-dev/aidd-framework/commit/391760e19eb69fe80e098c3aefc3c527cda2169a))
* **framework:** wave 1 audit fixes (schemas, gitignore, dependabot, links) ([4bcb670](https://github.com/ai-driven-dev/aidd-framework/commit/4bcb67069cd7af57f2a73fb55e19d89a583e2e7d))


### Documentation

* **aidd-pm:** sync CATALOG.md with current skill state ([44a398e](https://github.com/ai-driven-dev/aidd-framework/commit/44a398e558b20d80e0654a74cfeed58b8e6684c4))
* **framework:** add per-plugin CATALOG.md (auto-generated) ([d613282](https://github.com/ai-driven-dev/aidd-framework/commit/d61328242639bb77909055019629b1da3891bffc))
* **framework:** rewrite for plugin marketplace model ([9529d4c](https://github.com/ai-driven-dev/aidd-framework/commit/9529d4cbc8fef430354300e2bfcd8bff526c67a2))
* **framework:** sync READMEs and CATALOGs with current skills ([16c9372](https://github.com/ai-driven-dev/aidd-framework/commit/16c937268b27a6e80f4077da4989003be5d9d186))
* phase 1 critical audit fixes (skill invocations, catalog, templates) ([5b5342b](https://github.com/ai-driven-dev/aidd-framework/commit/5b5342b890ae0be4eb8302fd36e5a4d8882b9cbb))
* phase 2 high-severity audit fixes (security, lefthook, accuracy) ([95f29c3](https://github.com/ai-driven-dev/aidd-framework/commit/95f29c33c6a523166eaf09e0293000ee356a27dd))
* phase 3 medium/low audit fixes (OSS scaffolding, UX, accuracy) ([5e43650](https://github.com/ai-driven-dev/aidd-framework/commit/5e436502d7632b377f73129cfb73d312c3eea9ce))
* propagate per-skill README pattern across all plugins ([4427e3e](https://github.com/ai-driven-dev/aidd-framework/commit/4427e3ee7c096d03f7d7b30d418f3484e9d0541a))
* scrub cross-plugin references from skill READMEs ([9c23973](https://github.com/ai-driven-dev/aidd-framework/commit/9c2397396c16a80a04f66991a2ae6bd92dcce5d0))


### Refactoring

* **aidd-context:** restructure project init ([da90ed8](https://github.com/ai-driven-dev/aidd-framework/commit/da90ed8ac6c53aff7d1fae6d49477f4b1089a029))
* **aidd-dev:** rewrite SDLC as pure orchestrator with role-based agents ([dbc6edd](https://github.com/ai-driven-dev/aidd-framework/commit/dbc6edd360256154a14a82fb206b301b77684822))
* **aidd-pm:** restructure spec into build and refine actions, sync plugin docs ([107241e](https://github.com/ai-driven-dev/aidd-framework/commit/107241e76e444d6afeef8d767ed1501c972ef338))
* **framework:** align sdlc orchestrator and sub-skills around alex baseline ([92535cd](https://github.com/ai-driven-dev/aidd-framework/commit/92535cdf285effeee4cba9027dd7fd6a88c8c737))
* **framework:** canonical action shape, model-A rules, plugin audit sweep ([29ef579](https://github.com/ai-driven-dev/aidd-framework/commit/29ef579a683302c28f23de383acc1912ebcfe01e))
* **framework:** canonical template for aidd-pm skills + tighter SKILL.md descriptions ([0ea9b80](https://github.com/ai-driven-dev/aidd-framework/commit/0ea9b8021320778e64fb1c3806eb59eabfb6130c))
* **framework:** make content tool-agnostic and self-contained ([84165a9](https://github.com/ai-driven-dev/aidd-framework/commit/84165a917c9c36b6bca10599e9f4699908bd79ba))
* **framework:** remove embedded skill content for distribution-mode migration ([ee43a32](https://github.com/ai-driven-dev/aidd-framework/commit/ee43a323505791ffb7d41395539c7bc665e8a6c5))
* **framework:** rename skill folders from [X.X] to NN-name format ([c8968bc](https://github.com/ai-driven-dev/aidd-framework/commit/c8968bc79dd7f24976392a6bce0c7f30c35b2ede))
