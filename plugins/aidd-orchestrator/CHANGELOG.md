# Changelog

## [2.2.1](https://github.com/ai-driven-dev/framework/compare/aidd-orchestrator-v2.2.0...aidd-orchestrator-v2.2.1) (2026-08-07)


### Bug Fixes

* **orchestrator:** backlog decide waits, apply forwards next step ([#602](https://github.com/ai-driven-dev/framework/issues/602)) ([15d552a](https://github.com/ai-driven-dev/framework/commit/15d552a0e3a551ad75ce75cffbf67ca528835e0b))


### Refactoring

* **framework:** one home for the skill contract ([#601](https://github.com/ai-driven-dev/framework/issues/601)) ([415a777](https://github.com/ai-driven-dev/framework/commit/415a77706c84277036dc7470d6dc329f9abde1de))

## [2.2.0](https://github.com/ai-driven-dev/framework/compare/aidd-orchestrator-v2.1.1...aidd-orchestrator-v2.2.0) (2026-08-06)


### Features

* **aidd-pm:** keep a typed product backlog coherent whoever writes to it ([#582](https://github.com/ai-driven-dev/framework/issues/582)) ([fe0eebc](https://github.com/ai-driven-dev/framework/commit/fe0eebc5cf142e6668859f83dfe7ae4a38097435))


### Refactoring

* **orchestrator:** replace SDLC actions with protocols ([#517](https://github.com/ai-driven-dev/framework/issues/517)) ([ed81604](https://github.com/ai-driven-dev/framework/commit/ed816044709b2b7081cc00ad2103a8571bf0ad6c))

## [2.1.1](https://github.com/ai-driven-dev/framework/compare/aidd-orchestrator-v2.1.0...aidd-orchestrator-v2.1.1) (2026-07-10)


### Documentation

* **framework:** rework the documentation — install-first, concise, emoji-styled ([#407](https://github.com/ai-driven-dev/framework/issues/407)) ([6c0914a](https://github.com/ai-driven-dev/framework/commit/6c0914ad507ba2930a2bcc502e99825ae780747c))


### Refactoring

* remove per-skill README.md mirrors ([#302](https://github.com/ai-driven-dev/framework/issues/302)) ([#396](https://github.com/ai-driven-dev/framework/issues/396)) ([1b94c3c](https://github.com/ai-driven-dev/framework/commit/1b94c3c0108c21eacfacf63f55fa7a24dc79d8dd))

## [2.1.0](https://github.com/ai-driven-dev/framework/compare/aidd-orchestrator-v2.0.0...aidd-orchestrator-v2.1.0) (2026-06-30)


### Features

* **skills:** sync argument hints ([#296](https://github.com/ai-driven-dev/framework/issues/296)) ([5aa9216](https://github.com/ai-driven-dev/framework/commit/5aa92166cc80d74c79a1dab183224517c3fb1f49))


### Refactoring

* conform remaining skills to the authoring contract ([#334](https://github.com/ai-driven-dev/framework/issues/334)) ([dcc232a](https://github.com/ai-driven-dev/framework/commit/dcc232a5a7a7bcdf0c477b36399fd4d412685022))
* **skills:** forbid colon and em dash in descriptions, codify in R5 ([1407a9a](https://github.com/ai-driven-dev/framework/commit/1407a9a996b4d705d8586512c533659d8c44d445))

## [2.0.0](https://github.com/ai-driven-dev/framework/compare/aidd-orchestrator-v1.0.3...aidd-orchestrator-v2.0.0) (2026-06-19)


### ⚠ BREAKING CHANGES

* **framework:** auto-routing is removed. Skills are now manual-invoke only; the prompt-to-skill routing hint no longer runs.

### Features

* **framework:** remove evals system end-to-end ([#261](https://github.com/ai-driven-dev/framework/issues/261)) ([9a3c1b8](https://github.com/ai-driven-dev/framework/commit/9a3c1b8237359842f3200683732bc73b825582f6))


### Miscellaneous

* **framework:** rename repository URLs aidd-framework to framework ([#266](https://github.com/ai-driven-dev/framework/issues/266)) ([7cfc0a3](https://github.com/ai-driven-dev/framework/commit/7cfc0a3cf5fcd8eb068000744f2854d19624546f))

## [1.0.3](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-orchestrator-v1.0.2...aidd-orchestrator-v1.0.3) (2026-06-03)


### Bug Fixes

* **framework:** make all 31 skill names spec-compliant (kebab, folder-matched, no colons) ([#172](https://github.com/ai-driven-dev/aidd-framework/issues/172)) ([a47505f](https://github.com/ai-driven-dev/aidd-framework/commit/a47505f5d63e939db0bf28629adbafec888e28e6))

## [1.0.2](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-orchestrator-v1.0.1...aidd-orchestrator-v1.0.2) (2026-05-29)


### Refactoring

* **aidd-context:** unify 03-context-generate on Model Y tool-resolution ([#155](https://github.com/ai-driven-dev/aidd-framework/issues/155)) ([09e3c56](https://github.com/ai-driven-dev/aidd-framework/commit/09e3c564a3c1c12e9915f85dff7902a613919a98))

## [1.0.1](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-orchestrator-v1.0.0...aidd-orchestrator-v1.0.1) (2026-05-21)


### Bug Fixes

* **aidd-orchestrator:** correct broken link to 02-ask-config action ([#142](https://github.com/ai-driven-dev/aidd-framework/issues/142)) ([256c4f4](https://github.com/ai-driven-dev/aidd-framework/commit/256c4f42e31a64843384c99cc32082c0856d8154))
* **aidd-orchestrator:** write to-review as a label, not a command ([#143](https://github.com/ai-driven-dev/aidd-framework/issues/143)) ([971fd9d](https://github.com/ai-driven-dev/aidd-framework/commit/971fd9d35befcad5951c62ccdb2cac21f132779d))

## [1.0.0](https://github.com/ai-driven-dev/aidd-framework/compare/aidd-orchestrator-v1.0.0...aidd-orchestrator-v1.0.0) (2026-05-19)


### Features

* **aidd-context:** extend context-generate with plugins, commands, hooks, marketplaces; add async-dev router ([d409bab](https://github.com/ai-driven-dev/aidd-framework/commit/d409babb029aca89355c4d7bc9d21d007ff012a2))
* **aidd-orchestrator:** action 08 prints inline how-to-generate guides per secret ([ac64f33](https://github.com/ai-driven-dev/aidd-framework/commit/ac64f3386ee1932fff6c2cec3620d7eccddeb1c4))
* **aidd-orchestrator:** branch enforcement, comment passthrough, skip routing ([4d3acc8](https://github.com/ai-driven-dev/aidd-framework/commit/4d3acc85713aa9f7a45c80db9ae2e571d76c69bb))
* **aidd-orchestrator:** branch enforcement, comment passthrough, skip routing ([3a5cec0](https://github.com/ai-driven-dev/aidd-framework/commit/3a5cec08dbed819472de85c933ab021ee0854855))
* **aidd-orchestrator:** drop OS cron, route local scheduling via Claude Code ([1b6ec12](https://github.com/ai-driven-dev/aidd-framework/commit/1b6ec12f711a1a3b06bed9f5c180003c153ef21b))
* **aidd-orchestrator:** local daemon path bypasses Claude Code Tasks quota ([2d573f3](https://github.com/ai-driven-dev/aidd-framework/commit/2d573f31b394b0431c52b52e6883c37f17cf2282))
* **aidd-orchestrator:** per-developer Anthropic account routing in remote mode ([837857d](https://github.com/ai-driven-dev/aidd-framework/commit/837857dd84bebcbd9f46e48ea45715bfa96caa00))
* **aidd-orchestrator:** setup skill goes end-to-end (5 new actions) ([9d4628c](https://github.com/ai-driven-dev/aidd-framework/commit/9d4628cd29795ae74a9989b749184319ea03e6ad))
* **aidd-orchestrator:** smoke test uses a throwaway issue, never the user's backlog ([84596ac](https://github.com/ai-driven-dev/aidd-framework/commit/84596ac2584e0c8f6393462332dbbb4c70e609ae))
* async-dev router + context-generate determinism tightening ([#128](https://github.com/ai-driven-dev/aidd-framework/issues/128)) ([213a82e](https://github.com/ai-driven-dev/aidd-framework/commit/213a82efbfc85aa4bed5de33b1079fba29ec4fac))
* **framework:** refactor to marketplace plugin architecture and skills ([27128a9](https://github.com/ai-driven-dev/aidd-framework/commit/27128a96314904b7b57b0bc419e4d29b7a7edaf0))
* **orchestrator:** add github_write_auth dimension to setup skill and workflow ([897754b](https://github.com/ai-driven-dev/aidd-framework/commit/897754b20717383b612ea0480e83c3f2d6736639))


### Bug Fixes

* **aidd-orchestrator:** action 07 detects project/user scope before prompting ([d84b514](https://github.com/ai-driven-dev/aidd-framework/commit/d84b514e757b405210315e5927361bf201fd40ee))
* **aidd-orchestrator:** action 07 skips when plugins already loaded (project or user scope) ([e9739bb](https://github.com/ai-driven-dev/aidd-framework/commit/e9739bbdeafc358ad57994ac989ca1160bcb1130))
* **aidd-orchestrator:** cosmetic — run_id fallback + dedup review summary ([2734e05](https://github.com/ai-driven-dev/aidd-framework/commit/2734e05ce37bf2f0546c9a542a64f18d5e0e8768))
* **aidd-orchestrator:** delegate-sdlc owns push + PR creation; SDLC writes code only ([fcfdac4](https://github.com/ai-driven-dev/aidd-framework/commit/fcfdac4f4d72729b28b86cb28849cb61a8a6343f))
* **aidd-orchestrator:** forbid leaking action 06 internals into SDLC prompt ([5243f31](https://github.com/ai-driven-dev/aidd-framework/commit/5243f31640c64e79102332167a0a4e3d37b2b826))
* **aidd-orchestrator:** forbid leaking action 06 internals into SDLC prompt ([f933193](https://github.com/ai-driven-dev/aidd-framework/commit/f933193b63e54c40eaac18aac0ed8ae4708f9718))
* **aidd-orchestrator:** iter-1 review never stops on human comment; delegate enforces no-push-to-main ([35753a4](https://github.com/ai-driven-dev/aidd-framework/commit/35753a441da96113805ddd3976476a100c52dd13))
* **aidd-orchestrator:** make audit + finalize self-verifying ([8972d86](https://github.com/ai-driven-dev/aidd-framework/commit/8972d8676c6087ad1ff766c3a83bc9f36862b165))
* **aidd-orchestrator:** outcome decided by observation, not by the agent ([4273e0e](https://github.com/ai-driven-dev/aidd-framework/commit/4273e0e704f26e1228d0dfdf00a857c3164e4c3c))
* **aidd-orchestrator:** scheduling defaults to Desktop (1min min); cloud routine min 1h ([6005096](https://github.com/ai-driven-dev/aidd-framework/commit/6005096ff007d568a2f68862811cc4259f156291))
* **aidd-orchestrator:** sdlc owns push + PR; orchestrator dictates the contract and verifies ([840c248](https://github.com/ai-driven-dev/aidd-framework/commit/840c2489eaf63cb822f9f3ab5db06fabcaaebf13))
* **aidd-orchestrator:** self-verifying audit + finalize ([8f45f13](https://github.com/ai-driven-dev/aidd-framework/commit/8f45f13abbe08dccc63666794efa25d22697f334))
* **aidd-orchestrator:** skip audit push when no PR; drop orphan .json on main ([9e9dca4](https://github.com/ai-driven-dev/aidd-framework/commit/9e9dca4e5d3645ddf592fc97b1129c034feb8870))
* **aidd-orchestrator:** unbreak workflow YAML (alias parsing on marker bodies) ([243f234](https://github.com/ai-driven-dev/aidd-framework/commit/243f234f02322658b17d96330d5dd6f06d927892))
* **aidd-orchestrator:** YAML post-step observes reality when agent forgets ([e24d6a6](https://github.com/ai-driven-dev/aidd-framework/commit/e24d6a66ca4c17083daa5a4dec69f3160bfb10d4))
* **aidd-orchestrator:** YAML post-step observes reality when agent forgets ([c3a3405](https://github.com/ai-driven-dev/aidd-framework/commit/c3a3405fc9b894aa015096e81d4623d0a16ec5c1))
* **framework:** correct slash command naming in docs ([adad60a](https://github.com/ai-driven-dev/aidd-framework/commit/adad60aacaa120f3abf55100625bed7a3a87a50a))
* **orchestrator:** enforce SDLC delegation + persist audit log on PR branch ([8f5ed79](https://github.com/ai-driven-dev/aidd-framework/commit/8f5ed799b9b00126331d0673e27b3460984e4cae))


### Miscellaneous

* **ci:** SHA-pin every external action and add CodeQL workflow ([66d5fcf](https://github.com/ai-driven-dev/aidd-framework/commit/66d5fcf99776df2885a84b2ef70943ff63099748))
* **framework:** bulk alignment — evals everywhere, em-dash purge, audit template, stale refs fixed ([0dfd79d](https://github.com/ai-driven-dev/aidd-framework/commit/0dfd79dac5ce7f15194b4aa9b58b5dd61fdf14b6))
* **framework:** bump aidd-pm to 1.0.0 and apply audit fixes ([97573bc](https://github.com/ai-driven-dev/aidd-framework/commit/97573bcf1b7624f6cf1acaa62791b9cdbe1b237b))
* **framework:** regenerate plugin catalogs after audit sweep ([448b111](https://github.com/ai-driven-dev/aidd-framework/commit/448b111662335197c9e4e415db391fc4e8d5c79f))
* **framework:** release as 4.0.0 ([5b0fc9d](https://github.com/ai-driven-dev/aidd-framework/commit/5b0fc9d9116e37abe7ef5dbb5d06438f607475e8))
* **framework:** self-host summarize-markdown.mjs for per-plugin CATALOG ([ee62862](https://github.com/ai-driven-dev/aidd-framework/commit/ee6286237d3b1b97ebaf67aa68f8152015d61e90))
* **framework:** trigger ci recheck after history rewrite ([391760e](https://github.com/ai-driven-dev/aidd-framework/commit/391760e19eb69fe80e098c3aefc3c527cda2169a))


### Documentation

* **aidd-context:** refresh descriptions to cover all seven generated artifacts ([8cbb5a2](https://github.com/ai-driven-dev/aidd-framework/commit/8cbb5a2d6d5b5e5f51aa125cf2066f1322b987fd))
* **aidd-context:** refresh descriptions to cover the seven generated artifacts ([b1bef44](https://github.com/ai-driven-dev/aidd-framework/commit/b1bef44b87d6e02d071b75ce513dfbf0f881a547))
* **aidd-orchestrator:** rewrite README with full local + remote coverage ([ac3b47e](https://github.com/ai-driven-dev/aidd-framework/commit/ac3b47ebe33cdaa58b036750df7142c271300339))
* **framework:** add per-plugin CATALOG.md (auto-generated) ([d613282](https://github.com/ai-driven-dev/aidd-framework/commit/d61328242639bb77909055019629b1da3891bffc))
* **orchestrator:** add async-dev lifecycle state diagram to run skill README ([ac4c867](https://github.com/ai-driven-dev/aidd-framework/commit/ac4c8672159549ef8d4e85141f8beabe75c36271))
* **orchestrator:** align README with sibling plugin pattern + add to framework catalog ([7c62edd](https://github.com/ai-driven-dev/aidd-framework/commit/7c62edde873b94e046a94517833100eec35feddc))
* **orchestrator:** restructure plugin and per-skill READMEs ([cb841de](https://github.com/ai-driven-dev/aidd-framework/commit/cb841def85c91905d137820ac3e9467d217f5da4))
* phase 1 critical audit fixes (skill invocations, catalog, templates) ([5b5342b](https://github.com/ai-driven-dev/aidd-framework/commit/5b5342b890ae0be4eb8302fd36e5a4d8882b9cbb))
* phase 2 high-severity audit fixes (security, lefthook, accuracy) ([95f29c3](https://github.com/ai-driven-dev/aidd-framework/commit/95f29c33c6a523166eaf09e0293000ee356a27dd))
* phase 3 medium/low audit fixes (OSS scaffolding, UX, accuracy) ([5e43650](https://github.com/ai-driven-dev/aidd-framework/commit/5e436502d7632b377f73129cfb73d312c3eea9ce))
* propagate per-skill README pattern across all plugins ([4427e3e](https://github.com/ai-driven-dev/aidd-framework/commit/4427e3ee7c096d03f7d7b30d418f3484e9d0541a))


### Refactoring

* **aidd-orchestrator:** observe-reality + YAML-owned lifecycle ([5b64b4a](https://github.com/ai-driven-dev/aidd-framework/commit/5b64b4aef9cb77898244ca8c81d539bc46473760))
* **aidd-orchestrator:** observe-reality verification + YAML-owned lifecycle ([d193b99](https://github.com/ai-driven-dev/aidd-framework/commit/d193b9935a5a8d318c6432aa1d587793c9d7114f))
* **framework:** canonical action shape, model-A rules, plugin audit sweep ([29ef579](https://github.com/ai-driven-dev/aidd-framework/commit/29ef579a683302c28f23de383acc1912ebcfe01e))
* **plugin:** rename aidd-async-dev to aidd-orchestrator ([4cb0f71](https://github.com/ai-driven-dev/aidd-framework/commit/4cb0f71d1beaf6d991d71a4d73405b3a3357c6c3))
* **plugin:** suffix skill names with -async-dev for self-documentation ([c19a5a4](https://github.com/ai-driven-dev/aidd-framework/commit/c19a5a4c5ade09f129158defb3899e63d2598a6b))
