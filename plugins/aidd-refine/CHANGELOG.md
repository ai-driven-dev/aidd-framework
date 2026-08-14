# Changelog

## [3.0.0](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v2.2.4...aidd-refine-v3.0.0) (2026-08-14)


### ⚠ BREAKING CHANGES

* **refine:** `aidd-refine:03-condense` is removed, and the skills after it are renumbered: `04-shadow-areas` becomes `03-shadow-areas`, and `05-fact-check` becomes `04-fact-check`. Any pinned reference to the old names must be updated. The plugin no longer ships a hooks directory.

### Features

* **refine:** remove condense skill and its hook ([#624](https://github.com/ai-driven-dev/framework/issues/624)) ([e7e2c43](https://github.com/ai-driven-dev/framework/commit/e7e2c43819ca6e8f976d5d613c0b4dfc23e51019))

## [2.2.4](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v2.2.3...aidd-refine-v2.2.4) (2026-08-07)


### Refactoring

* **framework:** one home for the skill contract ([#601](https://github.com/ai-driven-dev/framework/issues/601)) ([415a777](https://github.com/ai-driven-dev/framework/commit/415a77706c84277036dc7470d6dc329f9abde1de))

## [2.2.3](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v2.2.2...aidd-refine-v2.2.3) (2026-08-06)


### Refactoring

* **orchestrator:** replace SDLC actions with protocols ([#517](https://github.com/ai-driven-dev/framework/issues/517)) ([ed81604](https://github.com/ai-driven-dev/framework/commit/ed816044709b2b7081cc00ad2103a8571bf0ad6c))
* **plugins:** action citations use markdown links, not @ ([c5da712](https://github.com/ai-driven-dev/framework/commit/c5da7126ef30354e17d4665300bd88481fc7c816))

## [2.2.2](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v2.2.1...aidd-refine-v2.2.2) (2026-07-31)


### Refactoring

* **aidd-refine:** 01-brainstorm moves from fixed probing loop to internal discovery map ([#510](https://github.com/ai-driven-dev/framework/issues/510)) ([824220e](https://github.com/ai-driven-dev/framework/commit/824220e7361a9793f7751d54bf0f4d3c22535523)), closes [#504](https://github.com/ai-driven-dev/framework/issues/504)

## [2.2.1](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v2.2.0...aidd-refine-v2.2.1) (2026-07-10)


### Refactoring

* remove per-skill README.md mirrors ([#302](https://github.com/ai-driven-dev/framework/issues/302)) ([#396](https://github.com/ai-driven-dev/framework/issues/396)) ([1b94c3c](https://github.com/ai-driven-dev/framework/commit/1b94c3c0108c21eacfacf63f55fa7a24dc79d8dd))

## [2.2.0](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v2.1.0...aidd-refine-v2.2.0) (2026-07-06)


### Features

* **framework:** read action files before running, across all skills ([#389](https://github.com/ai-driven-dev/framework/issues/389)) ([9d592a6](https://github.com/ai-driven-dev/framework/commit/9d592a6d8c1ca3d0ac8f8aaf54e30e7186a8eb48))

## [2.1.0](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v2.0.0...aidd-refine-v2.1.0) (2026-06-30)


### Features

* **skills:** sync argument hints ([#296](https://github.com/ai-driven-dev/framework/issues/296)) ([5aa9216](https://github.com/ai-driven-dev/framework/commit/5aa92166cc80d74c79a1dab183224517c3fb1f49))


### Refactoring

* **aidd-dev:** redesign 01-plan into gather/explore/wireframe/plan ([#271](https://github.com/ai-driven-dev/framework/issues/271)) ([dba017e](https://github.com/ai-driven-dev/framework/commit/dba017e8e4c6ef9bc80325791495f1b5fe8c350b)), closes [#292](https://github.com/ai-driven-dev/framework/issues/292) [#265](https://github.com/ai-driven-dev/framework/issues/265) [#276](https://github.com/ai-driven-dev/framework/issues/276)
* **aidd-refine:** align skills with skill contract ([#327](https://github.com/ai-driven-dev/framework/issues/327)) ([bc69310](https://github.com/ai-driven-dev/framework/commit/bc693100ce14d4ce6de0ebecaa7883e67bccef5d))
* conform remaining skills to the authoring contract ([#334](https://github.com/ai-driven-dev/framework/issues/334)) ([dcc232a](https://github.com/ai-driven-dev/framework/commit/dcc232a5a7a7bcdf0c477b36399fd4d412685022))

## [2.0.0](https://github.com/ai-driven-dev/framework/compare/aidd-refine-v1.1.2...aidd-refine-v2.0.0) (2026-06-19)


### ⚠ BREAKING CHANGES

* **framework:** auto-routing is removed. Skills are now manual-invoke only; the prompt-to-skill routing hint no longer runs.

### Features

* **framework:** remove evals system end-to-end ([#261](https://github.com/ai-driven-dev/framework/issues/261)) ([9a3c1b8](https://github.com/ai-driven-dev/framework/commit/9a3c1b8237359842f3200683732bc73b825582f6))


### Miscellaneous

* **framework:** rename repository URLs aidd-framework to framework ([#266](https://github.com/ai-driven-dev/framework/issues/266)) ([7cfc0a3](https://github.com/ai-driven-dev/framework/commit/7cfc0a3cf5fcd8eb068000744f2854d19624546f))


### Refactoring

* **aidd-refine:** rebuild brainstorm as a deep conversational prober ([#298](https://github.com/ai-driven-dev/framework/issues/298)) ([51a86b5](https://github.com/ai-driven-dev/framework/commit/51a86b52c6dd05e4b81b3cf33cd14d5a5ad6ed6e))

## [1.1.2](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-refine-v1.1.1...aidd-refine-v1.1.2) (2026-06-03)


### Bug Fixes

* **framework:** make all 31 skill names spec-compliant (kebab, folder-matched, no colons) ([#172](https://github.com/ai-driven-dev/aidd-framework/issues/172)) ([a47505f](https://github.com/ai-driven-dev/aidd-framework/commit/a47505f5d63e939db0bf28629adbafec888e28e6))

## [1.1.1](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-refine-v1.1.0...aidd-refine-v1.1.1) (2026-05-29)


### Refactoring

* **aidd-context:** unify 03-context-generate on Model Y tool-resolution ([#155](https://github.com/ai-driven-dev/aidd-framework/issues/155)) ([09e3c56](https://github.com/ai-driven-dev/aidd-framework/commit/09e3c564a3c1c12e9915f85dff7902a613919a98))

## [1.1.0](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-refine-v1.0.0...aidd-refine-v1.1.0) (2026-05-21)


### Features

* **aidd-refine:** add fact-check skill ([#140](https://github.com/ai-driven-dev/aidd-framework/issues/140)) ([8b1eb77](https://github.com/ai-driven-dev/aidd-framework/commit/8b1eb77da505bae8a3a042fac7288a7d78eec760))


### Documentation

* fix coherence defects in README, docs, and plugin READMEs ([7bb04ac](https://github.com/ai-driven-dev/aidd-framework/commit/7bb04ac7f2fe922cdc2dc2402b592d5346e18166))
* fix coherence defects in README, docs, and plugin READMEs ([afcbca3](https://github.com/ai-driven-dev/aidd-framework/commit/afcbca3babc6c64714b826a83937d74ebbf2317c))

## [1.0.0](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-refine-v1.0.0...aidd-refine-v1.0.0) (2026-05-19)


### Features

* **aidd-refine:** add shadow-areas gap analyzer skill + evals CI ([0a731ad](https://github.com/ai-driven-dev/aidd-framework/commit/0a731adce448786520701a64d69ed0af24994087))
* **framework:** refactor to marketplace plugin architecture and skills ([27128a9](https://github.com/ai-driven-dev/aidd-framework/commit/27128a96314904b7b57b0bc419e4d29b7a7edaf0))


### Bug Fixes

* **framework:** correct slash command naming in docs ([adad60a](https://github.com/ai-driven-dev/aidd-framework/commit/adad60aacaa120f3abf55100625bed7a3a87a50a))


### Miscellaneous

* **aidd-refine:** clean up shadow-areas evals and catalog ([f577db6](https://github.com/ai-driven-dev/aidd-framework/commit/f577db65837b9e59617526f4dd055d3f7147bef7))
* **ci:** SHA-pin every external action and add CodeQL workflow ([66d5fcf](https://github.com/ai-driven-dev/aidd-framework/commit/66d5fcf99776df2885a84b2ef70943ff63099748))
* **framework:** bump aidd-pm to 1.0.0 and apply audit fixes ([97573bc](https://github.com/ai-driven-dev/aidd-framework/commit/97573bcf1b7624f6cf1acaa62791b9cdbe1b237b))
* **framework:** merge feat/readme-wow into main ([8f42cfc](https://github.com/ai-driven-dev/aidd-framework/commit/8f42cfc067dd973d0d689593a59da0582f2168e6))
* **framework:** regenerate plugin catalogs after audit sweep ([448b111](https://github.com/ai-driven-dev/aidd-framework/commit/448b111662335197c9e4e415db391fc4e8d5c79f))
* **framework:** release as 4.0.0 ([5b0fc9d](https://github.com/ai-driven-dev/aidd-framework/commit/5b0fc9d9116e37abe7ef5dbb5d06438f607475e8))
* **framework:** self-host summarize-markdown.mjs for per-plugin CATALOG ([ee62862](https://github.com/ai-driven-dev/aidd-framework/commit/ee6286237d3b1b97ebaf67aa68f8152015d61e90))
* **framework:** trigger ci recheck after history rewrite ([391760e](https://github.com/ai-driven-dev/aidd-framework/commit/391760e19eb69fe80e098c3aefc3c527cda2169a))


### Documentation

* **framework:** add per-plugin CATALOG.md (auto-generated) ([d613282](https://github.com/ai-driven-dev/aidd-framework/commit/d61328242639bb77909055019629b1da3891bffc))
* phase 1 critical audit fixes (skill invocations, catalog, templates) ([5b5342b](https://github.com/ai-driven-dev/aidd-framework/commit/5b5342b890ae0be4eb8302fd36e5a4d8882b9cbb))
* phase 2 high-severity audit fixes (security, lefthook, accuracy) ([95f29c3](https://github.com/ai-driven-dev/aidd-framework/commit/95f29c33c6a523166eaf09e0293000ee356a27dd))
* phase 3 medium/low audit fixes (OSS scaffolding, UX, accuracy) ([5e43650](https://github.com/ai-driven-dev/aidd-framework/commit/5e436502d7632b377f73129cfb73d312c3eea9ce))
* propagate per-skill README pattern across all plugins ([4427e3e](https://github.com/ai-driven-dev/aidd-framework/commit/4427e3ee7c096d03f7d7b30d418f3484e9d0541a))


### Refactoring

* **framework:** canonical action shape, model-A rules, plugin audit sweep ([29ef579](https://github.com/ai-driven-dev/aidd-framework/commit/29ef579a683302c28f23de383acc1912ebcfe01e))
* **framework:** extract meta-cognition skills into dedicated plugin ([2bf0b6e](https://github.com/ai-driven-dev/aidd-framework/commit/2bf0b6e5e8cb2d300808332cbe68af626d72009f))
