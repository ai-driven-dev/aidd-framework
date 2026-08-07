# Changelog

## [2.3.1](https://github.com/ai-driven-dev/framework/compare/aidd-vcs-v2.3.0...aidd-vcs-v2.3.1) (2026-08-07)


### Refactoring

* **framework:** one home for the skill contract ([#601](https://github.com/ai-driven-dev/framework/issues/601)) ([415a777](https://github.com/ai-driven-dev/framework/commit/415a77706c84277036dc7470d6dc329f9abde1de))

## [2.3.0](https://github.com/ai-driven-dev/framework/compare/aidd-vcs-v2.2.1...aidd-vcs-v2.3.0) (2026-08-06)


### Features

* **framework:** add QA and communication evaluations ([#512](https://github.com/ai-driven-dev/framework/issues/512)) ([871d192](https://github.com/ai-driven-dev/framework/commit/871d1926e9944af231b15951d54bfe6364234536))


### Refactoring

* **plugins:** action citations use markdown links, not @ ([c5da712](https://github.com/ai-driven-dev/framework/commit/c5da7126ef30354e17d4665300bd88481fc7c816))

## [2.2.1](https://github.com/ai-driven-dev/framework/compare/aidd-vcs-v2.2.0...aidd-vcs-v2.2.1) (2026-07-10)


### Documentation

* **framework:** rework the documentation — install-first, concise, emoji-styled ([#407](https://github.com/ai-driven-dev/framework/issues/407)) ([6c0914a](https://github.com/ai-driven-dev/framework/commit/6c0914ad507ba2930a2bcc502e99825ae780747c))


### Refactoring

* remove per-skill README.md mirrors ([#302](https://github.com/ai-driven-dev/framework/issues/302)) ([#396](https://github.com/ai-driven-dev/framework/issues/396)) ([1b94c3c](https://github.com/ai-driven-dev/framework/commit/1b94c3c0108c21eacfacf63f55fa7a24dc79d8dd))

## [2.2.0](https://github.com/ai-driven-dev/framework/compare/aidd-vcs-v2.1.0...aidd-vcs-v2.2.0) (2026-07-06)


### Features

* **framework:** read action files before running, across all skills ([#389](https://github.com/ai-driven-dev/framework/issues/389)) ([9d592a6](https://github.com/ai-driven-dev/framework/commit/9d592a6d8c1ca3d0ac8f8aaf54e30e7186a8eb48))

## [2.1.0](https://github.com/ai-driven-dev/framework/compare/aidd-vcs-v2.0.0...aidd-vcs-v2.1.0) (2026-06-30)


### Features

* **aidd-vcs:** add repo-init skill (init + publish a repository) ([#269](https://github.com/ai-driven-dev/framework/issues/269)) ([81115da](https://github.com/ai-driven-dev/framework/commit/81115da3420f068ba81da8591dfff34555005680))
* **skills:** sync argument hints ([#296](https://github.com/ai-driven-dev/framework/issues/296)) ([5aa9216](https://github.com/ai-driven-dev/framework/commit/5aa92166cc80d74c79a1dab183224517c3fb1f49))


### Bug Fixes

* **aidd-vcs:** sync pull-request skill contract with prefix routing ([#326](https://github.com/ai-driven-dev/framework/issues/326)) ([2db0005](https://github.com/ai-driven-dev/framework/commit/2db0005400c821a96481e990e22bea40c404912e))


### Documentation

* **framework:** unify change taxonomy into one source of truth ([#325](https://github.com/ai-driven-dev/framework/issues/325)) ([a42cc5b](https://github.com/ai-driven-dev/framework/commit/a42cc5b1bd0018e964de64f8098f09769f70fda0))


### Refactoring

* conform remaining skills to the authoring contract ([#334](https://github.com/ai-driven-dev/framework/issues/334)) ([dcc232a](https://github.com/ai-driven-dev/framework/commit/dcc232a5a7a7bcdf0c477b36399fd4d412685022))
* **framework:** executor/checker agents + SDLC orchestration redesign ([#314](https://github.com/ai-driven-dev/framework/issues/314)) ([7df7a34](https://github.com/ai-driven-dev/framework/commit/7df7a34dab251cd4190f76bb1cb031584bdea5bd))
* **skills:** forbid colon and em dash in descriptions, codify in R5 ([1407a9a](https://github.com/ai-driven-dev/framework/commit/1407a9a996b4d705d8586512c533659d8c44d445))

## [2.0.0](https://github.com/ai-driven-dev/framework/compare/aidd-vcs-v1.0.2...aidd-vcs-v2.0.0) (2026-06-19)


### ⚠ BREAKING CHANGES

* **framework:** auto-routing is removed. Skills are now manual-invoke only; the prompt-to-skill routing hint no longer runs.

### Features

* **framework:** remove evals system end-to-end ([#261](https://github.com/ai-driven-dev/framework/issues/261)) ([9a3c1b8](https://github.com/ai-driven-dev/framework/commit/9a3c1b8237359842f3200683732bc73b825582f6))


### Miscellaneous

* **framework:** rename repository URLs aidd-framework to framework ([#266](https://github.com/ai-driven-dev/framework/issues/266)) ([7cfc0a3](https://github.com/ai-driven-dev/framework/commit/7cfc0a3cf5fcd8eb068000744f2854d19624546f))

## [1.0.2](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-vcs-v1.0.1...aidd-vcs-v1.0.2) (2026-06-03)


### Bug Fixes

* **framework:** make all 31 skill names spec-compliant (kebab, folder-matched, no colons) ([#172](https://github.com/ai-driven-dev/aidd-framework/issues/172)) ([a47505f](https://github.com/ai-driven-dev/aidd-framework/commit/a47505f5d63e939db0bf28629adbafec888e28e6))

## [1.0.1](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-vcs-v1.0.0...aidd-vcs-v1.0.1) (2026-05-29)


### Refactoring

* **aidd-context:** unify 03-context-generate on Model Y tool-resolution ([#155](https://github.com/ai-driven-dev/aidd-framework/issues/155)) ([09e3c56](https://github.com/ai-driven-dev/aidd-framework/commit/09e3c564a3c1c12e9915f85dff7902a613919a98))

## [1.0.0](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-vcs-v1.0.0...aidd-vcs-v1.0.0) (2026-05-19)


### Features

* **aidd-vcs:** add plugin with 4 VCS skills (commit, pull-request, release-tag, issue-create) ([84234de](https://github.com/ai-driven-dev/aidd-framework/commit/84234de00feace9933555914c991130238b83c2d))
* **aidd-vcs:** support /commit push inline argument ([ee4dda6](https://github.com/ai-driven-dev/aidd-framework/commit/ee4dda615150ae0d700a8ea872969ea93f3af1c0))
* **framework:** refactor to marketplace plugin architecture and skills ([27128a9](https://github.com/ai-driven-dev/aidd-framework/commit/27128a96314904b7b57b0bc419e4d29b7a7edaf0))
* **framework:** scaffold 4-plugin marketplace catalog ([7be5466](https://github.com/ai-driven-dev/aidd-framework/commit/7be5466ae78f432a5477a6f35d23cbff56b7f2df))
* **framework:** update build script for plugin layout and regenerate catalogs ([ea18188](https://github.com/ai-driven-dev/aidd-framework/commit/ea1818850a6c9d8b39de2aa5bae2b6ecf6741ddd))


### Bug Fixes

* **framework:** correct slash command naming in docs ([adad60a](https://github.com/ai-driven-dev/aidd-framework/commit/adad60aacaa120f3abf55100625bed7a3a87a50a))
* **framework:** wire SDLC contracts — namespace, plan paths, commit modes, validator semantics ([f5f14e0](https://github.com/ai-driven-dev/aidd-framework/commit/f5f14e01c6bb4a8c7952b6241b89a50816f636a6))


### Miscellaneous

* **ci:** SHA-pin every external action and add CodeQL workflow ([66d5fcf](https://github.com/ai-driven-dev/aidd-framework/commit/66d5fcf99776df2885a84b2ef70943ff63099748))
* **framework:** adopt release-please monorepo with per-plugin versioning ([9706606](https://github.com/ai-driven-dev/aidd-framework/commit/9706606207f1474033fb9b73ce089636362616c9))
* **framework:** bump aidd-pm to 1.0.0 and apply audit fixes ([97573bc](https://github.com/ai-driven-dev/aidd-framework/commit/97573bcf1b7624f6cf1acaa62791b9cdbe1b237b))
* **framework:** merge feat/plugin-content-tool-agnostic ([11cce19](https://github.com/ai-driven-dev/aidd-framework/commit/11cce1963826a1ed3e28837b9ccee8ed11fe2229))
* **framework:** release as 4.0.0 ([5b0fc9d](https://github.com/ai-driven-dev/aidd-framework/commit/5b0fc9d9116e37abe7ef5dbb5d06438f607475e8))
* **framework:** self-host summarize-markdown.mjs for per-plugin CATALOG ([ee62862](https://github.com/ai-driven-dev/aidd-framework/commit/ee6286237d3b1b97ebaf67aa68f8152015d61e90))
* **framework:** trigger ci recheck after history rewrite ([391760e](https://github.com/ai-driven-dev/aidd-framework/commit/391760e19eb69fe80e098c3aefc3c527cda2169a))
* **framework:** wave 1 audit fixes (schemas, gitignore, dependabot, links) ([4bcb670](https://github.com/ai-driven-dev/aidd-framework/commit/4bcb67069cd7af57f2a73fb55e19d89a583e2e7d))


### Documentation

* **framework:** add per-plugin CATALOG.md (auto-generated) ([d613282](https://github.com/ai-driven-dev/aidd-framework/commit/d61328242639bb77909055019629b1da3891bffc))
* **framework:** rewrite for plugin marketplace model ([9529d4c](https://github.com/ai-driven-dev/aidd-framework/commit/9529d4cbc8fef430354300e2bfcd8bff526c67a2))
* **framework:** sync READMEs and CATALOGs with current skills ([16c9372](https://github.com/ai-driven-dev/aidd-framework/commit/16c937268b27a6e80f4077da4989003be5d9d186))
* phase 1 critical audit fixes (skill invocations, catalog, templates) ([5b5342b](https://github.com/ai-driven-dev/aidd-framework/commit/5b5342b890ae0be4eb8302fd36e5a4d8882b9cbb))
* phase 3 medium/low audit fixes (OSS scaffolding, UX, accuracy) ([5e43650](https://github.com/ai-driven-dev/aidd-framework/commit/5e436502d7632b377f73129cfb73d312c3eea9ce))
* propagate per-skill README pattern across all plugins ([4427e3e](https://github.com/ai-driven-dev/aidd-framework/commit/4427e3ee7c096d03f7d7b30d418f3484e9d0541a))


### Refactoring

* **aidd-context:** restructure project init ([da90ed8](https://github.com/ai-driven-dev/aidd-framework/commit/da90ed8ac6c53aff7d1fae6d49477f4b1089a029))
* **aidd-vcs:** rewrite skills to canonical template with tool-agnostic process ([661f73b](https://github.com/ai-driven-dev/aidd-framework/commit/661f73b8825514cb3d0b8a734981f8c9d98054b0))
* **framework:** canonical template for aidd-pm skills + tighter SKILL.md descriptions ([0ea9b80](https://github.com/ai-driven-dev/aidd-framework/commit/0ea9b8021320778e64fb1c3806eb59eabfb6130c))
* **framework:** make content tool-agnostic and self-contained ([84165a9](https://github.com/ai-driven-dev/aidd-framework/commit/84165a917c9c36b6bca10599e9f4699908bd79ba))
* **framework:** remove embedded skill content for distribution-mode migration ([ee43a32](https://github.com/ai-driven-dev/aidd-framework/commit/ee43a323505791ffb7d41395539c7bc665e8a6c5))
* **framework:** rename skill folders from [X.X] to NN-name format ([c8968bc](https://github.com/ai-driven-dev/aidd-framework/commit/c8968bc79dd7f24976392a6bce0c7f30c35b2ede))
