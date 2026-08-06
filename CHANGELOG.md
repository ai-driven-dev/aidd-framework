# Changelog

## [5.7.0](https://github.com/ai-driven-dev/framework/compare/v5.6.0...v5.7.0) (2026-08-06)


### Features

* **aidd-pm:** keep a typed product backlog coherent whoever writes to it ([#582](https://github.com/ai-driven-dev/framework/issues/582)) ([fe0eebc](https://github.com/ai-driven-dev/framework/commit/fe0eebc5cf142e6668859f83dfe7ae4a38097435))
* **framework:** add QA and communication evaluations ([#512](https://github.com/ai-driven-dev/framework/issues/512)) ([871d192](https://github.com/ai-driven-dev/framework/commit/871d1926e9944af231b15951d54bfe6364234536))
* **kanban:** mount the kanban viewer on aidd as a hidden command ([#573](https://github.com/ai-driven-dev/framework/issues/573)) ([0e73737](https://github.com/ai-driven-dev/framework/commit/0e737371ff9c64e152d40575c29ffc985d31e614))


### Bug Fixes

* **ci:** align codeql-action init/analyze pins with autobuild's v4.37.4 ([297d6a6](https://github.com/ai-driven-dev/framework/commit/297d6a669e9e28f84010c0ac374505ce86508b90))
* **ci:** promote.yml uses the most recent sync commit as its replay boundary ([#593](https://github.com/ai-driven-dev/framework/issues/593)) ([5b83d1b](https://github.com/ai-driven-dev/framework/commit/5b83d1b2bbf262b1c55a02ea3b54e5100fdae631))
* **ci:** unbreak the framework-local checks after the kanban move ([#574](https://github.com/ai-driven-dev/framework/issues/574)) ([2f69050](https://github.com/ai-driven-dev/framework/commit/2f69050ce7df1059ff0fc337d6e171174a5f46b1))


### Miscellaneous

* **deps-dev:** bump @biomejs/biome from 2.4.7 to 2.5.6 in /cli ([#577](https://github.com/ai-driven-dev/framework/issues/577)) ([2f31414](https://github.com/ai-driven-dev/framework/commit/2f31414126465138bd62e280be8d909371ae1578))
* **deps-dev:** bump knip from 6.16.1 to 6.31.0 in /cli ([#578](https://github.com/ai-driven-dev/framework/issues/578)) ([c392ccf](https://github.com/ai-driven-dev/framework/commit/c392ccfe34a28a392270ab322e13c967d7f86e47))
* **deps:** bump react and @types/react in /cli ([#576](https://github.com/ai-driven-dev/framework/issues/576)) ([cc3659a](https://github.com/ai-driven-dev/framework/commit/cc3659a527cf0d50dbd7b07f703999b3ef13da93))


### Refactoring

* **aidd-context:** citations are links at their point of use ([dc85562](https://github.com/ai-driven-dev/framework/commit/dc855624736645325ae49b2df9e9768bbf82320f))
* **orchestrator:** replace SDLC actions with protocols ([#517](https://github.com/ai-driven-dev/framework/issues/517)) ([ed81604](https://github.com/ai-driven-dev/framework/commit/ed816044709b2b7081cc00ad2103a8571bf0ad6c))
* **plugins:** action citations use markdown links, not @ ([c5da712](https://github.com/ai-driven-dev/framework/commit/c5da7126ef30354e17d4665300bd88481fc7c816))

## [5.6.0](https://github.com/ai-driven-dev/framework/compare/v5.5.6...v5.6.0) (2026-07-31)


### Features

* **aidd-pm:** add evidence-bounded spike skill ([#543](https://github.com/ai-driven-dev/framework/issues/543)) ([16e5bfa](https://github.com/ai-driven-dev/framework/commit/16e5bfa59e70acc6692749089c2423c5a7efbe86)), closes [#412](https://github.com/ai-driven-dev/framework/issues/412)
* **aidd-pm:** add Product Brief discovery skill ([#551](https://github.com/ai-driven-dev/framework/issues/551)) ([d5e7224](https://github.com/ai-driven-dev/framework/commit/d5e72243f683bc57ea439f2571b410df8b332d69)), closes [#349](https://github.com/ai-driven-dev/framework/issues/349)


### Bug Fixes

* **ci:** promote.yml recognizes squash-merged back-merges as sync boundaries ([#526](https://github.com/ai-driven-dev/framework/issues/526)) ([0ce27a6](https://github.com/ai-driven-dev/framework/commit/0ce27a61aaca31982f3b8ff033e44112041bad8e))
* **cli:** derive framework build's SUPPORTED_TARGETS from the build registry ([#514](https://github.com/ai-driven-dev/framework/issues/514)) ([321a898](https://github.com/ai-driven-dev/framework/commit/321a898f0c83c5795cc56e3b7dae5d995c555cbc))
* **cli:** document intentional force on internal build-cache rebuild ([#505](https://github.com/ai-driven-dev/framework/issues/505)) ([2e3ebaa](https://github.com/ai-driven-dev/framework/commit/2e3ebaa6cf936a337348e07a14b4454a3f325dca))
* **cli:** drop the auth gate from self-update ([#525](https://github.com/ai-driven-dev/framework/issues/525)) ([ccf6d3c](https://github.com/ai-driven-dev/framework/commit/ccf6d3c44d231ac731319f2fd33bbf9575e5769e))
* **cli:** ide uninstall removes the settings keys it merged in ([#529](https://github.com/ai-driven-dev/framework/issues/529)) ([a9c55c5](https://github.com/ai-driven-dev/framework/commit/a9c55c54df85b55e5903dad8b6845d33fbab349c))
* **cli:** move marketplace refresh --force cache clear into its use-case ([#528](https://github.com/ai-driven-dev/framework/issues/528)) ([b2ea565](https://github.com/ai-driven-dev/framework/commit/b2ea565b9be891cc2fc39a41ac73568d55bf1eb0))
* **cli:** remove the build force option that never did anything ([#557](https://github.com/ai-driven-dev/framework/issues/557)) ([336e874](https://github.com/ai-driven-dev/framework/commit/336e8740056ea5824960791a9f034c27cab2e779))
* **cli:** repair the broken pnpm lockfile ([#542](https://github.com/ai-driven-dev/framework/issues/542)) ([debab01](https://github.com/ai-driven-dev/framework/commit/debab014367b412b35f48181a6778d50305baf14))
* **cli:** report each status/doctor scope once, under an accurate label ([#530](https://github.com/ai-driven-dev/framework/issues/530)) ([ba80b38](https://github.com/ai-driven-dev/framework/commit/ba80b38cfe0be822358ecde6ae536518cf6e5ac0))
* **cli:** report restore outcomes it previously hid ([#555](https://github.com/ai-driven-dev/framework/issues/555)) ([fe19bc3](https://github.com/ai-driven-dev/framework/commit/fe19bc38f96640d75edc8a541f6cdfb8256eafdb))
* **cli:** resolve buildClaudeStyleMarketplaceEntry and PluginTranslator name collisions ([#509](https://github.com/ai-driven-dev/framework/issues/509)) ([3b266b5](https://github.com/ai-driven-dev/framework/commit/3b266b50fda1f749a176db78b23b35f5aa1f80f3))
* **cli:** scope plugin restore to --tool, collapse double materialization ([#506](https://github.com/ai-driven-dev/framework/issues/506)) ([98b3045](https://github.com/ai-driven-dev/framework/commit/98b304596a1e044fc519e29ccccb14a730b268c0))
* **cli:** stop update and restore materializing marketplace plugins ([#556](https://github.com/ai-driven-dev/framework/issues/556)) ([9523142](https://github.com/ai-driven-dev/framework/commit/9523142b83a31b0710512fe65fb76d59851025f8))
* **cli:** surface menu errors instead of swallowing them into an infinite loop ([#524](https://github.com/ai-driven-dev/framework/issues/524)) ([91241c5](https://github.com/ai-driven-dev/framework/commit/91241c50bc1649a0bcd74417296787a88f2d86d5))
* framework headline ([#520](https://github.com/ai-driven-dev/framework/issues/520)) ([df65857](https://github.com/ai-driven-dev/framework/commit/df65857ccc55ad0bf507e949d6f4d7fa03267230))


### Miscellaneous

* **deps-dev:** bump @commitlint/cli from 19.8.1 to 21.2.1 in /cli ([#478](https://github.com/ai-driven-dev/framework/issues/478)) ([2b31132](https://github.com/ai-driven-dev/framework/commit/2b31132cf5db470b329835df5531b9ae058b9e33))
* **deps-dev:** bump @commitlint/config-conventional from 19.8.1 to 21.2.0 in /cli ([#539](https://github.com/ai-driven-dev/framework/issues/539)) ([9db5c0b](https://github.com/ai-driven-dev/framework/commit/9db5c0b63bf713a3122a53d1e455b3913b57b09c))
* **deps-dev:** bump @commitlint/config-conventional in /cli ([9db5c0b](https://github.com/ai-driven-dev/framework/commit/9db5c0b63bf713a3122a53d1e455b3913b57b09c))
* **deps-dev:** bump @types/node from 24.10.15 to 26.1.1 in /cli ([#480](https://github.com/ai-driven-dev/framework/issues/480)) ([d822a99](https://github.com/ai-driven-dev/framework/commit/d822a99c02e40838b6c2fc0225a5216d0dad2bc8))
* **deps-dev:** bump @types/node from 26.1.1 to 26.1.2 in /cli ([#534](https://github.com/ai-driven-dev/framework/issues/534)) ([b872b1c](https://github.com/ai-driven-dev/framework/commit/b872b1ca69cc57aa9b30d5de36a8c409518994d6))
* **deps-dev:** bump jscpd from 5.0.12 to 5.0.14 in /cli ([#537](https://github.com/ai-driven-dev/framework/issues/537)) ([a5a1cf4](https://github.com/ai-driven-dev/framework/commit/a5a1cf4712cc4edc5d74977de8ae1c3c471e0ee3))
* **deps-dev:** bump knip from 6.27.0 to 6.29.0 in /cli ([#536](https://github.com/ai-driven-dev/framework/issues/536)) ([9b575fe](https://github.com/ai-driven-dev/framework/commit/9b575fe940cd4760bf8797d3bf5bfda077477cbb))
* **deps-dev:** bump lefthook from 1.13.6 to 2.1.10 in /cli ([#535](https://github.com/ai-driven-dev/framework/issues/535)) ([a42cdf1](https://github.com/ai-driven-dev/framework/commit/a42cdf166545ce5dc7b88b3f43b239e7f0dac335))
* **deps-dev:** bump typescript from 5.9.3 to 7.0.2 in /cli ([#484](https://github.com/ai-driven-dev/framework/issues/484)) ([1aa97f6](https://github.com/ai-driven-dev/framework/commit/1aa97f68acd2b924ff5d80866fd1090b79a8b572))
* **deps:** bump @inquirer/prompts from 7.10.1 to 8.5.2 in /cli ([#540](https://github.com/ai-driven-dev/framework/issues/540)) ([87a39ec](https://github.com/ai-driven-dev/framework/commit/87a39eca6f8eb03c3f3ed2764c399e11590a45d3))
* **deps:** bump commander from 12.1.0 to 15.0.0 in /cli ([#479](https://github.com/ai-driven-dev/framework/issues/479)) ([32fa8e1](https://github.com/ai-driven-dev/framework/commit/32fa8e1161a99fd9e25d8e79b1943611c36593af))
* **deps:** bump smol-toml from 1.6.1 to 1.7.1 in /cli ([#538](https://github.com/ai-driven-dev/framework/issues/538)) ([06275a2](https://github.com/ai-driven-dev/framework/commit/06275a246da85eeaeec577ab87045db723a94414))


### Documentation

* fix marketplace install steps and note host-wide duplicate commands ([#515](https://github.com/ai-driven-dev/framework/issues/515)) ([3739fa8](https://github.com/ai-driven-dev/framework/commit/3739fa8bbf9c71d03cafacd1796462bfd3a4302f))
* **framework:** fix ROADMAP.md link, dedupe RELEASE.md, drop UPGRADE.md ([#563](https://github.com/ai-driven-dev/framework/issues/563)) ([e9a67c9](https://github.com/ai-driven-dev/framework/commit/e9a67c9a6b79bb8bd770a51ad64a6c07cd9426b7))
* **framework:** simplify contribution to one issue-first path ([#562](https://github.com/ai-driven-dev/framework/issues/562)) ([9205af1](https://github.com/ai-driven-dev/framework/commit/9205af128ff2c8ee0164e427fcfee3a904432469))


### Refactoring

* **aidd-refine:** 01-brainstorm moves from fixed probing loop to internal discovery map ([#510](https://github.com/ai-driven-dev/framework/issues/510)) ([824220e](https://github.com/ai-driven-dev/framework/commit/824220e7361a9793f7751d54bf0f4d3c22535523)), closes [#504](https://github.com/ai-driven-dev/framework/issues/504)
* **cli:** decide restores in one place ([#554](https://github.com/ai-driven-dev/framework/issues/554)) ([3965985](https://github.com/ai-driven-dev/framework/commit/39659857af17bc6a3ec48602e7188b55b8565d52))
* **cli:** detect plugin drift through one implementation ([#532](https://github.com/ai-driven-dev/framework/issues/532)) ([9bd9724](https://github.com/ai-driven-dev/framework/commit/9bd9724712dfb50c9b370a7f6f388048193a0162))
* **cli:** inject PostInstallPipelineUseCase and GitignoreUseCase ([#523](https://github.com/ai-driven-dev/framework/issues/523)) ([9478440](https://github.com/ai-driven-dev/framework/commit/9478440bb1ee011e7d96a280d3a1ec347a12cd4d))
* **cli:** inject shared StatusUseCase/RestoreUseCase/UpdateOneToolUseCase ([#507](https://github.com/ai-driven-dev/framework/issues/507)) ([#508](https://github.com/ai-driven-dev/framework/issues/508)) ([e39d4ec](https://github.com/ai-driven-dev/framework/commit/e39d4ec50eea0e80c4504984c12900720922927f))
* **cli:** install content sections through one engine ([#552](https://github.com/ai-driven-dev/framework/issues/552)) ([b4826e3](https://github.com/ai-driven-dev/framework/commit/b4826e3b68f4b3d5722fdc25165e6ecba06a1268))
* **cli:** resolve marketplaces through one path ([#549](https://github.com/ai-driven-dev/framework/issues/549)) ([0788910](https://github.com/ai-driven-dev/framework/commit/0788910c2de0956b789e21568b43d187ccbcf978))
* **cli:** resolve plugin catalogs through one path ([#547](https://github.com/ai-driven-dev/framework/issues/547)) ([2255a09](https://github.com/ai-driven-dev/framework/commit/2255a09c1afa6d524403323383a6381e9533ce78))
* **cli:** resolve the plugin base dir in one place ([#544](https://github.com/ai-driven-dev/framework/issues/544)) ([a8c1081](https://github.com/ai-driven-dev/framework/commit/a8c10811e787731fddd0ed0eb48efc80830abd10))
* **cli:** share the plugin translator pipeline ([#546](https://github.com/ai-driven-dev/framework/issues/546)) ([4edeca9](https://github.com/ai-driven-dev/framework/commit/4edeca9b822cb6f6fe82150f56463e4f71cff49e))
* **cli:** update ai and ide tools through one implementation ([#553](https://github.com/ai-driven-dev/framework/issues/553)) ([4244090](https://github.com/ai-driven-dev/framework/commit/4244090c2d3849623c6b4d1e25fe0c9a41fe6f37))

## [5.5.6](https://github.com/ai-driven-dev/framework/compare/v5.5.5...v5.5.6) (2026-07-22)


### Bug Fixes

* **docs:** resolve real broken markdown links, drop temporary link-check excludes ([#500](https://github.com/ai-driven-dev/framework/issues/500)) ([c6103e6](https://github.com/ai-driven-dev/framework/commit/c6103e636ede5c66667fd0e6ebe9eccee87a6e3d))

## [5.5.5](https://github.com/ai-driven-dev/framework/compare/v5.5.4...v5.5.5) (2026-07-22)


### Bug Fixes

* **release-please:** exclude manifest file from root path tracking ([#497](https://github.com/ai-driven-dev/framework/issues/497)) ([ec50488](https://github.com/ai-driven-dev/framework/commit/ec50488c3a02214224569a61dc590456f4054350))

## [5.5.4](https://github.com/ai-driven-dev/framework/compare/v5.5.3...v5.5.4) (2026-07-22)


### Bug Fixes

* **cli:** restore correct version again after second regression, re-anchor for release-please ([#493](https://github.com/ai-driven-dev/framework/issues/493)) ([22171ed](https://github.com/ai-driven-dev/framework/commit/22171ed8997a28fb695168353b0541401e3272b7))

## [5.5.3](https://github.com/ai-driven-dev/framework/compare/v5.5.2...v5.5.3) (2026-07-22)


### Bug Fixes

* **cli:** restore correct version after release-please regression ([#488](https://github.com/ai-driven-dev/framework/issues/488)) ([047bcb2](https://github.com/ai-driven-dev/framework/commit/047bcb29e5729d13dd7d27b0921ecc3cbb7eb9d3))

## [5.5.2](https://github.com/ai-driven-dev/framework/compare/v5.5.1...v5.5.2) (2026-07-22)


### Bug Fixes

* **cli:** add license and keywords for the npm package page ([691c1c3](https://github.com/ai-driven-dev/framework/commit/691c1c3d30f572e9f13a83f9997d9780b2205914))
* **cli:** migrate aidd-cli into framework as cli/, full history preserved ([daeef56](https://github.com/ai-driven-dev/framework/commit/daeef56aa3002142a1f2fbed048769e959ab60fe))
* **cli:** repoint self-references from aidd-cli to framework ([601c30c](https://github.com/ai-driven-dev/framework/commit/601c30c84d2adb04e3c6327a1a7778a894db3b33))


### Documentation

* **framework:** reposition readme as agnostic token-optimized framework ([#440](https://github.com/ai-driven-dev/framework/issues/440)) ([cfaf61b](https://github.com/ai-driven-dev/framework/commit/cfaf61ba2933c32b43393b819c9976ba0105ffe3))


### Refactoring

* **aidd-context:** action citations use markdown links, not @ ([7661980](https://github.com/ai-driven-dev/framework/commit/766198003bdd18c2f07564dcd8d2762d5c88bba4))
* **aidd-context:** restructure 10-learn into a 5-action router ([#455](https://github.com/ai-driven-dev/framework/issues/455)) ([8062400](https://github.com/ai-driven-dev/framework/commit/806240058e20b60bd417a23c0ca83829fc159414)), closes [#278](https://github.com/ai-driven-dev/framework/issues/278) [#419](https://github.com/ai-driven-dev/framework/issues/419)

## [5.5.1](https://github.com/ai-driven-dev/framework/compare/v5.5.0...v5.5.1) (2026-07-19)


### Documentation

* **framework:** update README title and tagline ([653de28](https://github.com/ai-driven-dev/framework/commit/653de289c5cfb7fc733a80e59d1b955cdaf9e6ac))

## [5.5.0](https://github.com/ai-driven-dev/framework/compare/v5.4.2...v5.5.0) (2026-07-16)


### Features

* **aidd-context:** cook research and apply actions ([#439](https://github.com/ai-driven-dev/framework/issues/439)) ([b6cadaf](https://github.com/ai-driven-dev/framework/commit/b6cadaf9fb476203ceb91b8593785a01cd4d87d2))
* **aidd-context:** rebuild project-memory as three actions, verified on both hosts ([#442](https://github.com/ai-driven-dev/framework/issues/442)) ([90b41ed](https://github.com/ai-driven-dev/framework/commit/90b41ed00804982983099d925eacb31ad0b34633))


### Bug Fixes

* **framework:** worktree-create installs deps so the first commit works ([#441](https://github.com/ai-driven-dev/framework/issues/441)) ([70645f7](https://github.com/ai-driven-dev/framework/commit/70645f7ac54a44954d843978d69d6805f9a09540))


### Miscellaneous

* **aidd-ui:** sync changelog from next ([9764179](https://github.com/ai-driven-dev/framework/commit/9764179679d69da498100d1f5b8698cf03dfe871))
* **deps-dev:** bump @commitlint/cli from 21.2.0 to 21.2.1 ([#438](https://github.com/ai-driven-dev/framework/issues/438)) ([fa469bc](https://github.com/ai-driven-dev/framework/commit/fa469bcb64697529f64f861611a07ac988c81a3e))
* **deps-dev:** bump lefthook from 2.1.9 to 2.1.10 ([#436](https://github.com/ai-driven-dev/framework/issues/436)) ([70a41b2](https://github.com/ai-driven-dev/framework/commit/70a41b23b997a1481edfa48b66c59f9ca37a3ed5))


### Refactoring

* **aidd-context:** lighten skill authoring flows ([#444](https://github.com/ai-driven-dev/framework/issues/444)) ([3cf5928](https://github.com/ai-driven-dev/framework/commit/3cf59289ff12fef44888d42eac9c54cbe52cd997))

## [5.4.2](https://github.com/ai-driven-dev/framework/compare/v5.4.1...v5.4.2) (2026-07-13)


### Documentation

* **vcs:** add commit cycle guidelines for AI auto commits ([#397](https://github.com/ai-driven-dev/framework/issues/397)) ([5a70cce](https://github.com/ai-driven-dev/framework/commit/5a70cce7ab2aee9ea29953b5bc1711f6025a2ef0))

## [5.4.1](https://github.com/ai-driven-dev/framework/compare/v5.4.0...v5.4.1) (2026-07-10)


### Bug Fixes

* **aidd-context:** onboard shows the stack, and its keys are pressable ([#428](https://github.com/ai-driven-dev/framework/issues/428)) ([3719204](https://github.com/ai-driven-dev/framework/commit/371920437cd931feab0ba9e3f889f7b3df8028f0))

## [5.4.0](https://github.com/ai-driven-dev/framework/compare/v5.3.1...v5.4.0) (2026-07-10)


### Features

* **aidd-context:** rebuild onboard as a token-lean guided tutorial ([#425](https://github.com/ai-driven-dev/framework/issues/425)) ([5038985](https://github.com/ai-driven-dev/framework/commit/5038985fbda2f52a3066732d2e19df83b6e79cc1))
* **hooks:** base new worktrees on next ([#402](https://github.com/ai-driven-dev/framework/issues/402)) ([70d8046](https://github.com/ai-driven-dev/framework/commit/70d8046a0946677309274a5452fd940988c5d961))


### Miscellaneous

* **commitlint:** declare the aidd-ui scope, long and short ([#423](https://github.com/ai-driven-dev/framework/issues/423)) ([abbcbc6](https://github.com/ai-driven-dev/framework/commit/abbcbc6c4e2c8a0d9727d09fc3b273bda2f902a4))
* **deps-dev:** bump @commitlint/cli from 21.0.2 to 21.2.0 ([#361](https://github.com/ai-driven-dev/framework/issues/361)) ([3374194](https://github.com/ai-driven-dev/framework/commit/3374194b248b26bedee4722d06688c587b69ff5c))
* **deps-dev:** bump @commitlint/config-conventional ([#362](https://github.com/ai-driven-dev/framework/issues/362)) ([ecc0e55](https://github.com/ai-driven-dev/framework/commit/ecc0e550ee2facc2c8cbb29053305463824181ff))
* **deps-dev:** bump js-yaml from 5.0.0 to 5.2.1 ([#401](https://github.com/ai-driven-dev/framework/issues/401)) ([c0b57d3](https://github.com/ai-driven-dev/framework/commit/c0b57d3bb8183cc957a6beaccafcfbdfc94ffae9))
* **framework:** type issues instead of labelling them ([#422](https://github.com/ai-driven-dev/framework/issues/422)) ([9b6651e](https://github.com/ai-driven-dev/framework/commit/9b6651e09b5388f286efd469e7acd1ed70739d3a))
* release main ([#405](https://github.com/ai-driven-dev/framework/issues/405)) ([4d9412c](https://github.com/ai-driven-dev/framework/commit/4d9412cbe4ef3a7b3852d842f0e4f1e82b74c718))


### Documentation

* **framework:** clarify README pitch, terms, and install list ([#409](https://github.com/ai-driven-dev/framework/issues/409)) ([4fadaed](https://github.com/ai-driven-dev/framework/commit/4fadaed80b4d44e4b3750fe36edf8e7e9c263bc0))
* **framework:** clarify README pitch, terms, and install list ([#410](https://github.com/ai-driven-dev/framework/issues/410)) ([8d250b6](https://github.com/ai-driven-dev/framework/commit/8d250b65c2871167e558e4461acaac2522e6d436))
* **framework:** describe the board we actually run ([#424](https://github.com/ai-driven-dev/framework/issues/424)) ([df6c032](https://github.com/ai-driven-dev/framework/commit/df6c0326e448ce00d4eef49cf2c4bbc924c57f67))
* **framework:** rework the documentation — install-first, concise, emoji-styled ([#407](https://github.com/ai-driven-dev/framework/issues/407)) ([6c0914a](https://github.com/ai-driven-dev/framework/commit/6c0914ad507ba2930a2bcc502e99825ae780747c))


### Refactoring

* remove per-skill README.md mirrors ([#302](https://github.com/ai-driven-dev/framework/issues/302)) ([#396](https://github.com/ai-driven-dev/framework/issues/396)) ([1b94c3c](https://github.com/ai-driven-dev/framework/commit/1b94c3c0108c21eacfacf63f55fa7a24dc79d8dd))

## [5.3.1](https://github.com/ai-driven-dev/framework/compare/v5.3.0...v5.3.1) (2026-07-07)


### Miscellaneous

* release main ([#393](https://github.com/ai-driven-dev/framework/issues/393)) ([426c604](https://github.com/ai-driven-dev/framework/commit/426c604dba9f5f1c586ade768e55c90f914a4562))

## [5.3.0](https://github.com/ai-driven-dev/framework/compare/v5.2.2...v5.3.0) (2026-07-06)


### Features

* **aidd-context:** rebuild onboard as an AIDD project linter + runner ([fdf7ba5](https://github.com/ai-driven-dev/framework/commit/fdf7ba568c549c76033f3d0a30782904ddd588a5))
* **framework:** read action files before running, across all skills ([#389](https://github.com/ai-driven-dev/framework/issues/389)) ([9d592a6](https://github.com/ai-driven-dev/framework/commit/9d592a6d8c1ca3d0ac8f8aaf54e30e7186a8eb48))

## [5.2.2](https://github.com/ai-driven-dev/framework/compare/v5.2.1...v5.2.2) (2026-07-01)


### Miscellaneous

* **framework:** require one review on next ([3279df3](https://github.com/ai-driven-dev/framework/commit/3279df36f4a229942e2b65fa1601d02830c18b2d))


### Documentation

* **framework:** sync release-flow docs with reality ([34a3d1f](https://github.com/ai-driven-dev/framework/commit/34a3d1f39cc6646bea1963bf430416394081ab3b))

## [5.2.1](https://github.com/ai-driven-dev/framework/compare/v5.2.0...v5.2.1) (2026-07-01)


### Bug Fixes

* **dev:** close review report contract gaps ([29d99c6](https://github.com/ai-driven-dev/framework/commit/29d99c68f8b519a6d0a828005feb76fc1a0034e8))
* **dev:** critical functional severity and skipped-axis visibility ([810be09](https://github.com/ai-driven-dev/framework/commit/810be0978023509d8742af59d1967436d4d653d8))
* **dev:** make functional findings and verdict rules consistent ([4c0ac84](https://github.com/ai-driven-dev/framework/commit/4c0ac845ec4d6ab3793a604bc61f52a5e237b742))

## [5.2.0](https://github.com/ai-driven-dev/framework/compare/v5.1.1...v5.2.0) (2026-07-01)


### Features

* **dev:** enforce the review report section set with a validator ([befe416](https://github.com/ai-driven-dev/framework/commit/befe416ae8dc36cdb0f49f546d2a194bfa5fb9a8))


### Bug Fixes

* **framework:** guarantee and report Claude agent copy on reload ([#375](https://github.com/ai-driven-dev/framework/issues/375)) ([2f37bab](https://github.com/ai-driven-dev/framework/commit/2f37babadcb9736f507a1a84d5745d1affdf9bae))


### Refactoring

* **framework:** strict anti-slop templates and review redesign ([153ba42](https://github.com/ai-driven-dev/framework/commit/153ba42faff9177c66ebb97de4ea8d7512fc5b85))

## [5.1.1](https://github.com/ai-driven-dev/framework/compare/v5.1.0...v5.1.1) (2026-06-30)


### Miscellaneous

* **aidd-ui:** reset version to 0.1.0-alpha.0 ([726a8a0](https://github.com/ai-driven-dev/framework/commit/726a8a04ac692616915c65160e5d255c14ef2ea1))

## [5.1.0](https://github.com/ai-driven-dev/framework/compare/v5.0.3...v5.1.0) (2026-06-30)


### Features

* **aidd-dev:** route deletions to refactor cleanup with orphan sweep ([#328](https://github.com/ai-driven-dev/framework/issues/328)) ([2c75d0d](https://github.com/ai-driven-dev/framework/commit/2c75d0d7924b1b249c25fc121091387f0c373a7f))
* **aidd-ui:** scaffold alpha plugin (0.1.0-alpha.0) ([#319](https://github.com/ai-driven-dev/framework/issues/319)) ([a56792a](https://github.com/ai-driven-dev/framework/commit/a56792afb6584ba17115011721823a2439fb7759))
* **aidd-vcs:** add repo-init skill (init + publish a repository) ([#269](https://github.com/ai-driven-dev/framework/issues/269)) ([81115da](https://github.com/ai-driven-dev/framework/commit/81115da3420f068ba81da8591dfff34555005680))
* **framework:** add markdown link checker ([#307](https://github.com/ai-driven-dev/framework/issues/307)) ([efbc759](https://github.com/ai-driven-dev/framework/commit/efbc75936211f3ffdd2d14815db6762b42261407))
* **onboard:** phase 1 — read-once loop with a session ledger ([c17d38c](https://github.com/ai-driven-dev/framework/commit/c17d38cd46b9d80ba8112687178433309b75e6b0))
* **onboard:** phase 2 — foundation gate, skippable ([2712c17](https://github.com/ai-driven-dev/framework/commit/2712c1764027fb1a42fa994805da756ec7c865cf))
* **onboard:** phases 3-4 — capability map + project-adapted menu ([8ec202b](https://github.com/ai-driven-dev/framework/commit/8ec202b796a3fb36191456c134cc42ea51d42497))
* **skills:** sync argument hints ([#296](https://github.com/ai-driven-dev/framework/issues/296)) ([5aa9216](https://github.com/ai-driven-dev/framework/commit/5aa92166cc80d74c79a1dab183224517c3fb1f49))


### Bug Fixes

* **aidd-vcs:** sync pull-request skill contract with prefix routing ([#326](https://github.com/ai-driven-dev/framework/issues/326)) ([2db0005](https://github.com/ai-driven-dev/framework/commit/2db0005400c821a96481e990e22bea40c404912e))


### Miscellaneous

* **deps:** target next instead of main for dependabot ([#324](https://github.com/ai-driven-dev/framework/issues/324)) ([06c1e93](https://github.com/ai-driven-dev/framework/commit/06c1e9315979cd043d45221e1177ef49b57ce262))


### Documentation

* **aidd-context:** unify and trim agent instruction template ([#329](https://github.com/ai-driven-dev/framework/issues/329)) ([d3fe2ac](https://github.com/ai-driven-dev/framework/commit/d3fe2ac4600858195300518cb2b5db9ab57bbc69))
* **framework:** add dominance checks to review and rules ([#313](https://github.com/ai-driven-dev/framework/issues/313)) ([80daf0d](https://github.com/ai-driven-dev/framework/commit/80daf0d5e6276417a1b61fadf63a3d5025d6fc32))
* **framework:** unify change taxonomy into one source of truth ([#325](https://github.com/ai-driven-dev/framework/issues/325)) ([a42cc5b](https://github.com/ai-driven-dev/framework/commit/a42cc5b1bd0018e964de64f8098f09769f70fda0))
* **onboard:** brainstorm + validated plan for the onboard refactor ([a409d49](https://github.com/ai-driven-dev/framework/commit/a409d49c05206538c78103b28655edd7dbae7b66))
* **onboard:** refresh README for the snapshot+ledger+menu flow ([7bf212b](https://github.com/ai-driven-dev/framework/commit/7bf212b586c6ca4a5c0b5a9f81ba95d0483e5a1b))


### Refactoring

* **aidd-context:** dedupe project-memory templates and lighten actions ([#347](https://github.com/ai-driven-dev/framework/issues/347)) ([f2a252b](https://github.com/ai-driven-dev/framework/commit/f2a252ba6f0129d17bb71802bc40bdcf121a63c3))
* **aidd-dev:** redesign 01-plan into gather/explore/wireframe/plan ([#271](https://github.com/ai-driven-dev/framework/issues/271)) ([dba017e](https://github.com/ai-driven-dev/framework/commit/dba017e8e4c6ef9bc80325791495f1b5fe8c350b)), closes [#292](https://github.com/ai-driven-dev/framework/issues/292) [#265](https://github.com/ai-driven-dev/framework/issues/265) [#276](https://github.com/ai-driven-dev/framework/issues/276)
* **aidd-refine:** align skills with skill contract ([#327](https://github.com/ai-driven-dev/framework/issues/327)) ([bc69310](https://github.com/ai-driven-dev/framework/commit/bc693100ce14d4ce6de0ebecaa7883e67bccef5d))
* conform remaining skills to the authoring contract ([#334](https://github.com/ai-driven-dev/framework/issues/334)) ([dcc232a](https://github.com/ai-driven-dev/framework/commit/dcc232a5a7a7bcdf0c477b36399fd4d412685022))
* **framework:** executor/checker agents + SDLC orchestration redesign ([#314](https://github.com/ai-driven-dev/framework/issues/314)) ([7df7a34](https://github.com/ai-driven-dev/framework/commit/7df7a34dab251cd4190f76bb1cb031584bdea5bd))
* **onboard:** slim 03-act, drop colon from the description ([71e09ff](https://github.com/ai-driven-dev/framework/commit/71e09ff66962bb69adcd6285bf151e80fbd0dff1))
* **skills:** forbid colon and em dash in descriptions, codify in R5 ([1407a9a](https://github.com/ai-driven-dev/framework/commit/1407a9a996b4d705d8586512c533659d8c44d445))

## [5.0.3](https://github.com/ai-driven-dev/framework/compare/v5.0.2...v5.0.3) (2026-06-23)


### Miscellaneous

* **deps-dev:** bump js-yaml from 4.2.0 to 5.0.0 ([#322](https://github.com/ai-driven-dev/framework/issues/322)) ([f71bdd2](https://github.com/ai-driven-dev/framework/commit/f71bdd2be31c34aa43e5280659432fb3a9f1cdab))

## [5.0.2](https://github.com/ai-driven-dev/framework/compare/v5.0.1...v5.0.2) (2026-06-22)


### Miscellaneous

* **framework:** add setup guardrails and pet asset ([#310](https://github.com/ai-driven-dev/framework/issues/310)) ([ab317e8](https://github.com/ai-driven-dev/framework/commit/ab317e8b4f8c2ee022ec0fd1b8f79112dd67ca31))

## [5.0.1](https://github.com/ai-driven-dev/framework/compare/v5.0.0...v5.0.1) (2026-06-22)


### Documentation

* **aidd-context:** add explicit-scoped-includes rule (R13) to skill-generate ([#309](https://github.com/ai-driven-dev/framework/issues/309)) ([527e646](https://github.com/ai-driven-dev/framework/commit/527e6466c5052eb4f0a80739f3059c8f6dab1c41))
* **framework:** README star CTA, roadmap, star history + fix dead Discord link ([#312](https://github.com/ai-driven-dev/framework/issues/312)) ([032f4f0](https://github.com/ai-driven-dev/framework/commit/032f4f06aac94b4b70e9fe9d6375ae2e0158cc2b))

## [5.0.0](https://github.com/ai-driven-dev/framework/compare/v4.4.1...v5.0.0) (2026-06-19)


### ⚠ BREAKING CHANGES

* **framework:** auto-routing is removed. Skills are now manual-invoke only; the prompt-to-skill routing hint no longer runs.

### Features

* **aidd-context:** add cook skill for recipe how-to sheets ([#281](https://github.com/ai-driven-dev/framework/issues/281)) ([da350b4](https://github.com/ai-driven-dev/framework/commit/da350b4f020cbeb33ae3ffd20668f92e7d9d5535))
* **aidd-context:** per-artifact context generators (skill, rule, agent, command, hook) ([#264](https://github.com/ai-driven-dev/framework/issues/264)) ([647fe5a](https://github.com/ai-driven-dev/framework/commit/647fe5afed81c27e9201bd3f0ae119f422e75fb6))
* **aidd-dev:** add 10-todo skill for parallel todo fan-out ([#262](https://github.com/ai-driven-dev/framework/issues/262)) ([c086e05](https://github.com/ai-driven-dev/framework/commit/c086e05e7564f1be1414ebf1a6956e74cd4d7903))
* **aidd-dev:** track plan lifecycle status in frontmatter ([#251](https://github.com/ai-driven-dev/framework/issues/251)) ([3f63ae2](https://github.com/ai-driven-dev/framework/commit/3f63ae20a2a04eb44caed53bf9ddb79c29f951d0))
* **framework:** remove evals system end-to-end ([#261](https://github.com/ai-driven-dev/framework/issues/261)) ([9a3c1b8](https://github.com/ai-driven-dev/framework/commit/9a3c1b8237359842f3200683732bc73b825582f6))
* **framework:** rolling weekly release model (main/next) ([#308](https://github.com/ai-driven-dev/framework/issues/308)) ([2908b7a](https://github.com/ai-driven-dev/framework/commit/2908b7a9f86b8b06f805a16a1efe2c7009de4c9f))


### Bug Fixes

* **framework:** make reload installs via the CLI from the local clone ([#299](https://github.com/ai-driven-dev/framework/issues/299)) ([9799b8b](https://github.com/ai-driven-dev/framework/commit/9799b8b9ccbc0a959bc535c364bae4b237850fcc))
* **framework:** make setup work in worktrees ([b560fd9](https://github.com/ai-driven-dev/framework/commit/b560fd9247c1668dbce53df1a3c90f8ac447f0f8))
* **framework:** use node validators in hooks ([#295](https://github.com/ai-driven-dev/framework/issues/295)) ([e6b8355](https://github.com/ai-driven-dev/framework/commit/e6b8355d8daa452e8ac076f34eb39f8c1e55b3c6))


### Miscellaneous

* **framework:** allow full access in worktrees ([#306](https://github.com/ai-driven-dev/framework/issues/306)) ([15e279b](https://github.com/ai-driven-dev/framework/commit/15e279b104ec195ff9999c78a874341c153aee49))
* **framework:** enable local AIDD plugins for repo dogfooding ([#247](https://github.com/ai-driven-dev/framework/issues/247)) ([3564872](https://github.com/ai-driven-dev/framework/commit/35648729b1de6981911c9409adda10408b351c38))
* **framework:** make-based dev workflow (setup, reload, check) ([#273](https://github.com/ai-driven-dev/framework/issues/273)) ([844989c](https://github.com/ai-driven-dev/framework/commit/844989c40bad2e4d387379e2cc3976965029e230))
* **framework:** rename repository URLs aidd-framework to framework ([#266](https://github.com/ai-driven-dev/framework/issues/266)) ([7cfc0a3](https://github.com/ai-driven-dev/framework/commit/7cfc0a3cf5fcd8eb068000744f2854d19624546f))
* **framework:** share Codex worktree setup ([a40fca1](https://github.com/ai-driven-dev/framework/commit/a40fca11a271cd26cca3a17ca524cc6138e55b56))
* **framework:** stop shipping .mcp.json, recommend MCP servers in README ([#263](https://github.com/ai-driven-dev/framework/issues/263)) ([e602fa0](https://github.com/ai-driven-dev/framework/commit/e602fa0c8d49fbbd7d0b65f85a0d5122ee8d9c6c))


### Documentation

* **aidd-context:** refresh plugin README for the reworked skills ([#285](https://github.com/ai-driven-dev/framework/issues/285)) ([fdd7bc0](https://github.com/ai-driven-dev/framework/commit/fdd7bc0c8a21f8af8c4ac7189ef29079ea83c2d8))
* **contributing:** local testing guide, PR template overhaul, and label guide ([#244](https://github.com/ai-driven-dev/framework/issues/244)) ([cc5c090](https://github.com/ai-driven-dev/framework/commit/cc5c090621eef446ae8ce714675f71e7c0bcf22d))
* **framework:** add a human self-review attestation to the PR template ([#249](https://github.com/ai-driven-dev/framework/issues/249)) ([c3beb5d](https://github.com/ai-driven-dev/framework/commit/c3beb5d2a847608033ed6690ee2d91ff90c5d787))
* **framework:** add plugin concern taxonomy and skill placement rules ([#248](https://github.com/ai-driven-dev/framework/issues/248)) ([c6b474f](https://github.com/ai-driven-dev/framework/commit/c6b474fe1ed76c34196a476967bd520abb4e7cdc))
* **framework:** streamline README, add recipes, extract marketplace doc ([#280](https://github.com/ai-driven-dev/framework/issues/280)) ([a139b52](https://github.com/ai-driven-dev/framework/commit/a139b523143000dc3229194a9269f0eca4194bea))


### Refactoring

* **aidd-context:** conform 09-mermaid to the skill contract ([#286](https://github.com/ai-driven-dev/framework/issues/286)) ([4d8e942](https://github.com/ai-driven-dev/framework/commit/4d8e942367966ab5cb93938cfc6c8b2b089872b8))
* **aidd-context:** rebuild 00-onboard as a plain-language guide ([#284](https://github.com/ai-driven-dev/framework/issues/284)) ([5d7351a](https://github.com/ai-driven-dev/framework/commit/5d7351adb2b1e9e4b7c91a09dd265b72a0f720d1))
* **aidd-context:** rebuild 11-discovery as 11-explore ([#287](https://github.com/ai-driven-dev/framework/issues/287)) ([c16a397](https://github.com/ai-driven-dev/framework/commit/c16a39717ca9448ec41ce4bee5440ec36c61d2f5))
* **aidd-context:** rework 10-learn around scoring and explicit confirm ([#282](https://github.com/ai-driven-dev/framework/issues/282)) ([89935c0](https://github.com/ai-driven-dev/framework/commit/89935c032b5a64768c99b603efe4eabe5a3435ce))
* **aidd-context:** rework project-memory skill with capability model ([#279](https://github.com/ai-driven-dev/framework/issues/279)) ([a0e8da7](https://github.com/ai-driven-dev/framework/commit/a0e8da7fdaea4539da098e3a946b2a5b89f8473f))
* **aidd-refine:** rebuild brainstorm as a deep conversational prober ([#298](https://github.com/ai-driven-dev/framework/issues/298)) ([51a86b5](https://github.com/ai-driven-dev/framework/commit/51a86b52c6dd05e4b81b3cf33cd14d5a5ad6ed6e))

## [4.4.1](https://github.com/ai-driven-dev/aidd-framework/compare/v4.4.0...v4.4.1) (2026-06-04)


### Bug Fixes

* **ci:** build per-tool dist outside source tree ([#196](https://github.com/ai-driven-dev/aidd-framework/issues/196)) ([7fd66f8](https://github.com/ai-driven-dev/aidd-framework/commit/7fd66f8b3b6452b9fb680510c8b7266e04301a48))

## [4.4.0](https://github.com/ai-driven-dev/aidd-framework/compare/v4.3.1...v4.4.0) (2026-06-04)


### Features

* **ci:** build and attach per-tool framework distributions on release ([#188](https://github.com/ai-driven-dev/aidd-framework/issues/188)) ([7f94c82](https://github.com/ai-driven-dev/aidd-framework/commit/7f94c82a5cff5e15ad172784f9e483ace474432f))


### Documentation

* **framework:** add maintainers guide ([#184](https://github.com/ai-driven-dev/aidd-framework/issues/184)) ([09dc949](https://github.com/ai-driven-dev/aidd-framework/commit/09dc949e713ef14b0d8bb813f7959cf351e756be))
* **framework:** sync aidd_docs with current skill catalog for OSS release ([#187](https://github.com/ai-driven-dev/aidd-framework/issues/187)) ([bebcac3](https://github.com/ai-driven-dev/aidd-framework/commit/bebcac35b88691c122ac46eef44035cd4dee012c))

## [4.3.1](https://github.com/ai-driven-dev/aidd-framework/compare/v4.3.0...v4.3.1) (2026-06-04)


### Miscellaneous

* **deps-dev:** bump @commitlint/cli from 21.0.1 to 21.0.2 ([#175](https://github.com/ai-driven-dev/aidd-framework/issues/175)) ([61fedcd](https://github.com/ai-driven-dev/aidd-framework/commit/61fedcd390e4c7288c45f43d5ebbcf9a8fa8fe96))
* **deps-dev:** bump @commitlint/config-conventional ([#178](https://github.com/ai-driven-dev/aidd-framework/issues/178)) ([5ad7d74](https://github.com/ai-driven-dev/aidd-framework/commit/5ad7d745deb515cba34aa892bb9a4858443a0261))
* **deps-dev:** bump lefthook from 2.1.6 to 2.1.9 ([#176](https://github.com/ai-driven-dev/aidd-framework/issues/176)) ([d2b28ad](https://github.com/ai-driven-dev/aidd-framework/commit/d2b28ad363435457937ccd1487747e124043de4b))
* **framework:** require DCO check and add admin PR-bypass to main ruleset ([#181](https://github.com/ai-driven-dev/aidd-framework/issues/181)) ([44704e4](https://github.com/ai-driven-dev/aidd-framework/commit/44704e4ad7e401f2abf5348049725d4e23995360))
* reviewing rules ([6cd310a](https://github.com/ai-driven-dev/aidd-framework/commit/6cd310a18a60b25839e84e7b909d553d318f289d))


### Documentation

* **framework:** re-enable release and CI badges for public launch ([55d6d96](https://github.com/ai-driven-dev/aidd-framework/commit/55d6d961b726135b97e36d6eb398e62b8821a5b3))

## [4.3.0](https://github.com/ai-driven-dev/aidd-framework/compare/v4.2.0...v4.3.0) (2026-06-03)


### Features

* **aidd-dev:** expand refactor into a 4-axis router with push-only audit handoff ([#169](https://github.com/ai-driven-dev/aidd-framework/issues/169)) ([5c5272e](https://github.com/ai-driven-dev/aidd-framework/commit/5c5272e0c8f978b20404c48f33badef60e4d3227))


### Bug Fixes

* **aidd-context:** lift project-init tool selection into a flow-entry gate ([#165](https://github.com/ai-driven-dev/aidd-framework/issues/165)) ([6fe2d07](https://github.com/ai-driven-dev/aidd-framework/commit/6fe2d07b7d55adda38a6a4c7a42a84eda7bde762))
* **aidd-dev:** enforce mandatory SDLC steps so weak-model hosts cannot skip review ([#171](https://github.com/ai-driven-dev/aidd-framework/issues/171)) ([7037fdb](https://github.com/ai-driven-dev/aidd-framework/commit/7037fdb53ef3b40e10b6f135cfde61d8e9f1762c))
* **aidd-dev:** make review coherent - dedup templates, 3-level severity, read-only identity ([#170](https://github.com/ai-driven-dev/aidd-framework/issues/170)) ([a022a1a](https://github.com/ai-driven-dev/aidd-framework/commit/a022a1a46664dc846b88e6d1097372be1a06c86d))
* **framework:** make all 31 skill names spec-compliant (kebab, folder-matched, no colons) ([#172](https://github.com/ai-driven-dev/aidd-framework/issues/172)) ([a47505f](https://github.com/ai-driven-dev/aidd-framework/commit/a47505f5d63e939db0bf28629adbafec888e28e6))


### Miscellaneous

* **framework:** prepare repository for open-source launch ([35b20ae](https://github.com/ai-driven-dev/aidd-framework/commit/35b20ae5c5b4000d6f2773790b6abd8b7600a97d))


### Documentation

* rewrite v3.9.1 to v4.x upgrade guide with accurate command-to-skill mapping ([f041acd](https://github.com/ai-driven-dev/aidd-framework/commit/f041acd1a0d1d1b4fa502add6e901eb277be9ab6))

## [4.2.0](https://github.com/ai-driven-dev/aidd-framework/compare/v4.1.1...v4.2.0) (2026-05-29)


### Features

* **aidd-context:** multitool discovery - detect/propose/confirm gate + per-tool scan ([#162](https://github.com/ai-driven-dev/aidd-framework/issues/162)) ([43d18f0](https://github.com/ai-driven-dev/aidd-framework/commit/43d18f04e1acb01e21aa6b7ce953ffb348f3dfe9))
* **aidd-context:** re-scope 00-onboard to AIDD-wide project onboarding hub ([#153](https://github.com/ai-driven-dev/aidd-framework/issues/153)) ([935e37c](https://github.com/ai-driven-dev/aidd-framework/commit/935e37c3415fd30f5a5b46e138486194ff5a93bb))
* **aidd-dev:** restructure audit into a read-only 7-pillar router ([#164](https://github.com/ai-driven-dev/aidd-framework/issues/164)) ([4b3a37b](https://github.com/ai-driven-dev/aidd-framework/commit/4b3a37b65ee678db7580c35d26bd33ffcbf91950))


### Bug Fixes

* **aidd-dev:** add routing dispatch to choice-router skills for weak-model hosts ([#163](https://github.com/ai-driven-dev/aidd-framework/issues/163)) ([148b6e3](https://github.com/ai-driven-dev/aidd-framework/commit/148b6e3faf650165017b4ae146fadaa394d47b6e))


### Refactoring

* **aidd-context:** unify 03-context-generate on Model Y tool-resolution ([#155](https://github.com/ai-driven-dev/aidd-framework/issues/155)) ([09e3c56](https://github.com/ai-driven-dev/aidd-framework/commit/09e3c564a3c1c12e9915f85dff7902a613919a98))

## [4.1.1](https://github.com/ai-driven-dev/aidd-framework/compare/v4.1.0...v4.1.1) (2026-05-22)


### Documentation

* **aidd-context:** document seven artifacts and tool-agnostic wording ([7f57ec9](https://github.com/ai-driven-dev/aidd-framework/commit/7f57ec97e6fa515b07d817d9f692ffdecc1c0a56))
* **aidd-context:** document seven artifacts and tool-agnostic wording ([5594ec8](https://github.com/ai-driven-dev/aidd-framework/commit/5594ec8a590caed0ca1d96e945cdee7460216c5f))

## [4.1.0](https://github.com/ai-driven-dev/aidd-framework/compare/v4.0.0...v4.1.0) (2026-05-21)


### Features

* **aidd-refine:** add fact-check skill ([#140](https://github.com/ai-driven-dev/aidd-framework/issues/140)) ([8b1eb77](https://github.com/ai-driven-dev/aidd-framework/commit/8b1eb77da505bae8a3a042fac7288a7d78eec760))


### Bug Fixes

* **aidd-orchestrator:** correct broken link to 02-ask-config action ([#142](https://github.com/ai-driven-dev/aidd-framework/issues/142)) ([256c4f4](https://github.com/ai-driven-dev/aidd-framework/commit/256c4f42e31a64843384c99cc32082c0856d8154))
* **aidd-orchestrator:** write to-review as a label, not a command ([#143](https://github.com/ai-driven-dev/aidd-framework/issues/143)) ([971fd9d](https://github.com/ai-driven-dev/aidd-framework/commit/971fd9d35befcad5951c62ccdb2cac21f132779d))


### Miscellaneous

* **ci:** drop aidd-cli from release, ship clean marketplace + plugin zips ([59e4e8d](https://github.com/ai-driven-dev/aidd-framework/commit/59e4e8d80eb38ea2173d3a94c9613c0518666949))
* **ci:** stop using aidd-cli for release assets, ship a clean marketplace bundle ([9ecbf68](https://github.com/ai-driven-dev/aidd-framework/commit/9ecbf6876772a5deb17ec8fd908a5507f9f0188a))
* **release-please:** drop per-plugin release-as pins after the v4.0.0 cut ([48d283e](https://github.com/ai-driven-dev/aidd-framework/commit/48d283e03c82685223a65bb855735cdff2f5d1ce))
* **release-please:** drop per-plugin release-as pins after v4.0.0 ([ae5d16d](https://github.com/ai-driven-dev/aidd-framework/commit/ae5d16d6bbe534f5bdb99e9b681ce23d34a346bb))
* repoint auto-add workflow to AIDD Roadmap project ([#8](https://github.com/ai-driven-dev/aidd-framework/issues/8)) ([#150](https://github.com/ai-driven-dev/aidd-framework/issues/150)) ([b7f4e8a](https://github.com/ai-driven-dev/aidd-framework/commit/b7f4e8a7f56f0e9f5613aabb863b453466e73b83))


### Documentation

* fix coherence defects in README, docs, and plugin READMEs ([7bb04ac](https://github.com/ai-driven-dev/aidd-framework/commit/7bb04ac7f2fe922cdc2dc2402b592d5346e18166))
* fix coherence defects in README, docs, and plugin READMEs ([afcbca3](https://github.com/ai-driven-dev/aidd-framework/commit/afcbca3babc6c64714b826a83937d74ebbf2317c))

## [4.0.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.9.1...v4.0.0) (2026-05-19)


### Features

* **aidd-context:** add 00-onboard skill (state-aware guided loop) ([4f3d0fa](https://github.com/ai-driven-dev/aidd-framework/commit/4f3d0fa19f1104cdfd2f9f8442965182f403f181))
* **aidd-context:** add 01-bootstrap skill for SaaS architecture imagination ([4643594](https://github.com/ai-driven-dev/aidd-framework/commit/4643594163686a92bc02211770a7906e3d07c99f))
* **aidd-context:** extend 06-discovery with rule, hook, and memory finders ([3ad5661](https://github.com/ai-driven-dev/aidd-framework/commit/3ad56614eabdb2313b3e4951c7daa724b7a816cb))
* **aidd-context:** extend context-generate with plugins, commands, hooks, marketplaces; add async-dev router ([d409bab](https://github.com/ai-driven-dev/aidd-framework/commit/d409babb029aca89355c4d7bc9d21d007ff012a2))
* **aidd-context:** implement interactive brainstorming skill with structured actions for clarifying feature requests ([edba00c](https://github.com/ai-driven-dev/aidd-framework/commit/edba00c65f4323bfbf046ad24805841a263dd424))
* **aidd-context:** migrate commands to numbered actions ([324357a](https://github.com/ai-driven-dev/aidd-framework/commit/324357a8acef153b929fe6d1c85dff262bb041f8))
* **aidd-dev:** add 02-implement skill, renumber downstream skills ([16fa5d6](https://github.com/ai-driven-dev/aidd-framework/commit/16fa5d61cac55f5e8223cb55ce9e213dfcb7fdb6))
* **aidd-dev:** add interactive mode to 00-sdlc orchestrator ([8f9e245](https://github.com/ai-driven-dev/aidd-framework/commit/8f9e245cf390f16906516e9a1ea4a5d77fdef2f7))
* **aidd-dev:** centralize agents ([7f77514](https://github.com/ai-driven-dev/aidd-framework/commit/7f7751407972c63accbf352b1a44f5ba89269757))
* **aidd-dev:** enhance pre-flight checklist with user input markers for unresolved dependencies ([a8f41c6](https://github.com/ai-driven-dev/aidd-framework/commit/a8f41c645c3eb3a7aaad171a2d16062a85be1a5c))
* **aidd-dev:** migrate commands to numbered actions ([8ef0f8e](https://github.com/ai-driven-dev/aidd-framework/commit/8ef0f8ed4349f77702d5f07704085382ce831e2a))
* **aidd-dev:** scan rules and project files modifications in plan template ([0509421](https://github.com/ai-driven-dev/aidd-framework/commit/05094211fc6f79cd033c08a3409d3b494e3fd8ce))
* **aidd-orchestrator:** action 08 prints inline how-to-generate guides per secret ([ac64f33](https://github.com/ai-driven-dev/aidd-framework/commit/ac64f3386ee1932fff6c2cec3620d7eccddeb1c4))
* **aidd-orchestrator:** add async orchestration plugin ([58b7318](https://github.com/ai-driven-dev/aidd-framework/commit/58b7318c2d349248dc489614df3fa45c2748ce21))
* **aidd-orchestrator:** add local-mode poll script + drop default agent ([5253065](https://github.com/ai-driven-dev/aidd-framework/commit/52530651f9d199ce40d51a8295be3712cc6a20fa))
* **aidd-orchestrator:** branch enforcement, comment passthrough, skip routing ([4d3acc8](https://github.com/ai-driven-dev/aidd-framework/commit/4d3acc85713aa9f7a45c80db9ae2e571d76c69bb))
* **aidd-orchestrator:** branch enforcement, comment passthrough, skip routing ([3a5cec0](https://github.com/ai-driven-dev/aidd-framework/commit/3a5cec08dbed819472de85c933ab021ee0854855))
* **aidd-orchestrator:** clean v1.0.0 — to-X / claude/Y label split, drop superflu ([26851ec](https://github.com/ai-driven-dev/aidd-framework/commit/26851ec9384871ec0049d6c7dfc5efe011ff4a2a))
* **aidd-orchestrator:** drop OS cron, route local scheduling via Claude Code ([1b6ec12](https://github.com/ai-driven-dev/aidd-framework/commit/1b6ec12f711a1a3b06bed9f5c180003c153ef21b))
* **aidd-orchestrator:** local daemon path bypasses Claude Code Tasks quota ([2d573f3](https://github.com/ai-driven-dev/aidd-framework/commit/2d573f31b394b0431c52b52e6883c37f17cf2282))
* **aidd-orchestrator:** per-developer Anthropic account routing in remote mode ([837857d](https://github.com/ai-driven-dev/aidd-framework/commit/837857dd84bebcbd9f46e48ea45715bfa96caa00))
* **aidd-orchestrator:** setup skill goes end-to-end (5 new actions) ([9d4628c](https://github.com/ai-driven-dev/aidd-framework/commit/9d4628cd29795ae74a9989b749184319ea03e6ad))
* **aidd-orchestrator:** smoke test uses a throwaway issue, never the user's backlog ([84596ac](https://github.com/ai-driven-dev/aidd-framework/commit/84596ac2584e0c8f6393462332dbbb4c70e609ae))
* **aidd-pm:** scaffold RC skills with actions ([22fc883](https://github.com/ai-driven-dev/aidd-framework/commit/22fc88365631718e76e893e41e8789c1bb5da599))
* **aidd-refine:** add shadow-areas gap analyzer skill + evals CI ([0a731ad](https://github.com/ai-driven-dev/aidd-framework/commit/0a731adce448786520701a64d69ed0af24994087))
* **aidd-vcs:** add plugin with 4 VCS skills (commit, pull-request, release-tag, issue-create) ([84234de](https://github.com/ai-driven-dev/aidd-framework/commit/84234de00feace9933555914c991130238b83c2d))
* **aidd-vcs:** support /commit push inline argument ([ee4dda6](https://github.com/ai-driven-dev/aidd-framework/commit/ee4dda615150ae0d700a8ea872969ea93f3af1c0))
* async-dev router + context-generate determinism tightening ([#128](https://github.com/ai-driven-dev/aidd-framework/issues/128)) ([213a82e](https://github.com/ai-driven-dev/aidd-framework/commit/213a82efbfc85aa4bed5de33b1079fba29ec4fac))
* enhance auto-implement skill with detailed orchestration rules and process steps ([c7b991b](https://github.com/ai-driven-dev/aidd-framework/commit/c7b991b3f5cc7b0f7d41206f18a4a94121878903))
* **framework:** delete legacy commands/ directory ([dac60bb](https://github.com/ai-driven-dev/aidd-framework/commit/dac60bbb7c953abadf19f0cb239987c81c006376))
* **framework:** migrate 5 pre-refactored skills into plugins ([da2987c](https://github.com/ai-driven-dev/aidd-framework/commit/da2987c7c281d3b087e6c09f5079decf7e066bd2))
* **framework:** refactor to marketplace plugin architecture and skills ([27128a9](https://github.com/ai-driven-dev/aidd-framework/commit/27128a96314904b7b57b0bc419e4d29b7a7edaf0))
* **framework:** relocate templates and conventions into skill assets ([6920182](https://github.com/ai-driven-dev/aidd-framework/commit/692018202f84cd6f5d885f5737f305f77f79ac5f))
* **framework:** scaffold 4-plugin marketplace catalog ([7be5466](https://github.com/ai-driven-dev/aidd-framework/commit/7be5466ae78f432a5477a6f35d23cbff56b7f2df))
* **framework:** split MCP and SessionStart hook into plugins ([527f9b8](https://github.com/ai-driven-dev/aidd-framework/commit/527f9b8c13ea1c7e45b277218569e6881559cadc))
* **framework:** update build script for plugin layout and regenerate catalogs ([ea18188](https://github.com/ai-driven-dev/aidd-framework/commit/ea1818850a6c9d8b39de2aa5bae2b6ecf6741ddd))
* new generate_skills ([d288e9f](https://github.com/ai-driven-dev/aidd-framework/commit/d288e9ff2240deb26ea6b7faa9e6fa0e36b814a6))
* new status and spec templates from openai long running task ([4ed3947](https://github.com/ai-driven-dev/aidd-framework/commit/4ed3947aef46b00d47c6d1bde47cc526f7ad5bcd))
* **orchestrator:** add github_write_auth dimension to setup skill and workflow ([897754b](https://github.com/ai-driven-dev/aidd-framework/commit/897754b20717383b612ea0480e83c3f2d6736639))
* **plugin:** publish aidd framework as Claude Code plugin ([c913480](https://github.com/ai-driven-dev/aidd-framework/commit/c91348083d5734f4163ca55dbcf46265b8ceb76d))
* update agent descriptions for clarity and role specificity in CATALOG and agent files ([eabaf0f](https://github.com/ai-driven-dev/aidd-framework/commit/eabaf0f27e7764fb6f16f8d30f1ebf98cdc62dfa))
* update ARCHITECTURE.md with new project structure and decisions for skills organization ([e8f6442](https://github.com/ai-driven-dev/aidd-framework/commit/e8f6442b40dd4e7e221e53b82025bc02def650ac))
* update CATALOG.md with new actions, assets, and references for generate-skill ([07d3d3e](https://github.com/ai-driven-dev/aidd-framework/commit/07d3d3ec75b207c6e7fc474a049250fe528bf63b))


### Bug Fixes

* **aidd-context:** correct hooks.json format for Claude Code and Copilot ([f66ca72](https://github.com/ai-driven-dev/aidd-framework/commit/f66ca7247ea7b135b6792781ff978055b747392b))
* **aidd-context:** rename skill frontmatter name from generate-skill to context-generate ([805cf6f](https://github.com/ai-driven-dev/aidd-framework/commit/805cf6f8b8897ce2283679d991041345d2192f12))
* **aidd-context:** repair @-paths, generalize mermaid reference, delegate frontmatter to references ([1ff4a04](https://github.com/ai-driven-dev/aidd-framework/commit/1ff4a04c0f1fedbfbcc7db6a362c08f787e34815))
* **aidd-context:** replace placeholder with generic path pattern in copilot rule example ([e22b358](https://github.com/ai-driven-dev/aidd-framework/commit/e22b358c39a30ad6a0b38246b469bee41f2573cf))
* **aidd-dev:** enforce skill-in-agent rule — orchestrator never loads skills directly ([8957d1d](https://github.com/ai-driven-dev/aidd-framework/commit/8957d1dc4e2844128eb8ea8ceb68c27cbe41af28))
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
* **ci:** unblock failing workflows (evals validator + codeql gate + commit SHAs) ([8f76a43](https://github.com/ai-driven-dev/aidd-framework/commit/8f76a43956a2fae66cc968e7203fc176aa0f4722))
* **framework:** accept short plugin scopes and marketplace in commitlint enum ([cd477f6](https://github.com/ai-driven-dev/aidd-framework/commit/cd477f6e43d6f80957ee31ac58400d9620bb24c8))
* **framework:** add version field to catalog entries ([c64a2cb](https://github.com/ai-driven-dev/aidd-framework/commit/c64a2cba8dbd7fcf58269a7bf3e8e7571062e895))
* **framework:** add version field to each plugin catalog entry ([26888af](https://github.com/ai-driven-dev/aidd-framework/commit/26888af05038d656f6c1c311e736d452224b3462))
* **framework:** correct slash command naming in docs ([adad60a](https://github.com/ai-driven-dev/aidd-framework/commit/adad60aacaa120f3abf55100625bed7a3a87a50a))
* **framework:** namespace frontmatter for relocated skills ([ea220a1](https://github.com/ai-driven-dev/aidd-framework/commit/ea220a19667da43cbe88c0dca87913b1d1c381cb))
* **framework:** repair broken @-paths, stale skill ref, and Ressources typo across plugins ([558bb34](https://github.com/ai-driven-dev/aidd-framework/commit/558bb347a6358240556e6c27d0ec09ff4b443bc0))
* **framework:** repair internal broken markdown links ([8ae9dc1](https://github.com/ai-driven-dev/aidd-framework/commit/8ae9dc1ae729ab65c512661a9e0ec6fb8dc618ed))
* **framework:** replace relative plugin links with absolute GitHub URLs in aidd_docs/README.md ([d171001](https://github.com/ai-driven-dev/aidd-framework/commit/d171001bfae5177ae5c67aff681787261a1df8b9))
* **framework:** wire SDLC contracts — namespace, plan paths, commit modes, validator semantics ([f5f14e0](https://github.com/ai-driven-dev/aidd-framework/commit/f5f14e01c6bb4a8c7952b6241b89a50816f636a6))
* **orchestrator:** enforce SDLC delegation + persist audit log on PR branch ([8f5ed79](https://github.com/ai-driven-dev/aidd-framework/commit/8f5ed799b9b00126331d0673e27b3460984e4cae))
* **plugin:** scope aidd plugin to skills only + fix YAML frontmatter ([3779e6e](https://github.com/ai-driven-dev/aidd-framework/commit/3779e6e63333cb093eda54d106079c2d318f37df))
* update flowchart direction in README for improved clarity ([563bf6c](https://github.com/ai-driven-dev/aidd-framework/commit/563bf6c884fdf29294e884848708efce4d1ad4dd))


### Miscellaneous

* **aidd-context:** refresh stale async-dev refs in project-init template and routing evals ([13a424c](https://github.com/ai-driven-dev/aidd-framework/commit/13a424cbad77b1afde7f8867e867ad1e2068f443))
* **aidd-refine:** clean up shadow-areas evals and catalog ([f577db6](https://github.com/ai-driven-dev/aidd-framework/commit/f577db65837b9e59617526f4dd055d3f7147bef7))
* **ci:** SHA-pin every external action and add CodeQL workflow ([66d5fcf](https://github.com/ai-driven-dev/aidd-framework/commit/66d5fcf99776df2885a84b2ef70943ff63099748))
* **commitlint:** scope-enum back as warning with broader list ([da0b9ec](https://github.com/ai-driven-dev/aidd-framework/commit/da0b9ec34a2923c68a6bff889d7ec36ca0aec70e))
* **deps:** bundle all open Dependabot upgrades ([eb40257](https://github.com/ai-driven-dev/aidd-framework/commit/eb402572bee04b0f2d39392b43cf6083ee057315))
* **deps:** bundle all open Dependabot upgrades ([3bc18de](https://github.com/ai-driven-dev/aidd-framework/commit/3bc18de02a925b0851819911da8d12242c9884d5))
* **framework:** add aidd-refine and aidd-orchestrator to commitlint scope-enum ([6416e1a](https://github.com/ai-driven-dev/aidd-framework/commit/6416e1a4d38c0a64574d00992241a166bc82c9cb))
* **framework:** add OSS standard files (LICENSE, SECURITY, CoC, PR template) ([7cd0a69](https://github.com/ai-driven-dev/aidd-framework/commit/7cd0a6996a7df026d409ce07661489a1c550437e))
* **framework:** adopt release-please monorepo with per-plugin versioning ([9706606](https://github.com/ai-driven-dev/aidd-framework/commit/9706606207f1474033fb9b73ce089636362616c9))
* **framework:** align release tarball flow with v5 framework layout ([a5601f7](https://github.com/ai-driven-dev/aidd-framework/commit/a5601f71328a2034ec2096603dcb42266f7adc6b))
* **framework:** bulk alignment — evals everywhere, em-dash purge, audit template, stale refs fixed ([0dfd79d](https://github.com/ai-driven-dev/aidd-framework/commit/0dfd79dac5ce7f15194b4aa9b58b5dd61fdf14b6))
* **framework:** bump aidd-pm to 1.0.0 and apply audit fixes ([97573bc](https://github.com/ai-driven-dev/aidd-framework/commit/97573bcf1b7624f6cf1acaa62791b9cdbe1b237b))
* **framework:** bump marketplace to 4.0.0 and refresh aidd-dev SDLC docs ([073a4a6](https://github.com/ai-driven-dev/aidd-framework/commit/073a4a617f08841d950ae0d5ebd3b45fdcbb0f93))
* **framework:** disable body-max-line-length, keep scope-enum strict ([4a6a22f](https://github.com/ai-driven-dev/aidd-framework/commit/4a6a22f07bdeac150038ad7201a5b31d4a8359e4))
* **framework:** disable proposed MCP servers by default ([785293b](https://github.com/ai-driven-dev/aidd-framework/commit/785293b45eea542712031e326c18ac7454068cbf))
* **framework:** disable scope-enum to unblock CI on existing commits ([5ed4947](https://github.com/ai-driven-dev/aidd-framework/commit/5ed4947fc01ba687c8040357679129412d875271))
* **framework:** disable subject-case to unblock CI ([4889ce5](https://github.com/ai-driven-dev/aidd-framework/commit/4889ce5572cb996f869814287e1a3a79b12464a4))
* **framework:** downgrade scope-enum to warning and disable body-max-line-length ([157a8e1](https://github.com/ai-driven-dev/aidd-framework/commit/157a8e1891367a4c16d000c43eb2731eb0ab5c9a))
* **framework:** drop auto-generated CATALOG.md ([6004359](https://github.com/ai-driven-dev/aidd-framework/commit/60043597f682e2da5a9ced5713bf2fe799f0539a))
* **framework:** drop scope-enum whitelist, keep classic conventional rules ([189963f](https://github.com/ai-driven-dev/aidd-framework/commit/189963f89e31340c0b5965751fddba1d09e210c6))
* **framework:** drop skills.json aggregator ([671fef8](https://github.com/ai-driven-dev/aidd-framework/commit/671fef8cdd8a6ec2af022e7fa73dd454b9adb7eb))
* **framework:** merge feat/plugin-content-tool-agnostic ([11cce19](https://github.com/ai-driven-dev/aidd-framework/commit/11cce1963826a1ed3e28837b9ccee8ed11fe2229))
* **framework:** merge feat/readme-wow into main ([8f42cfc](https://github.com/ai-driven-dev/aidd-framework/commit/8f42cfc067dd973d0d689593a59da0582f2168e6))
* **framework:** merge origin/feat/plugin-architecture ([0082b4c](https://github.com/ai-driven-dev/aidd-framework/commit/0082b4cc7916fca6e3060362a0ce762c155a0e19))
* **framework:** prune stale tracked files and tighten ROADMAP ([33975d6](https://github.com/ai-driven-dev/aidd-framework/commit/33975d63b8bdda1249214433663298266be71959))
* **framework:** raise header-max-length to 120 and downgrade to warning ([4bccb58](https://github.com/ai-driven-dev/aidd-framework/commit/4bccb58db4f8729105e388af327e07200cb9b0c6))
* **framework:** regenerate aidd-dev CATALOG.md after merge ([0639dc0](https://github.com/ai-driven-dev/aidd-framework/commit/0639dc0c5f8372ad6a238961cbf64ac3b2756ded))
* **framework:** regenerate plugin catalogs after aidd-context audit ([7b5907a](https://github.com/ai-driven-dev/aidd-framework/commit/7b5907ac00bc661b7ce0bd66f335d6980badfa31))
* **framework:** regenerate plugin catalogs after audit sweep ([448b111](https://github.com/ai-driven-dev/aidd-framework/commit/448b111662335197c9e4e415db391fc4e8d5c79f))
* **framework:** release as 4.0.0 ([5b0fc9d](https://github.com/ai-driven-dev/aidd-framework/commit/5b0fc9d9116e37abe7ef5dbb5d06438f607475e8))
* **framework:** remove $schema ref from marketplace.json — CLI owns validation ([ae78847](https://github.com/ai-driven-dev/aidd-framework/commit/ae78847d9f5cd30cb57dc77812b2596dbc6f9429))
* **framework:** remove PostToolUse hook from hooks configuration ([0b1eb66](https://github.com/ai-driven-dev/aidd-framework/commit/0b1eb664adf74d3d552c23e5da69def8fc9dbbb8))
* **framework:** restore strict commitlint rules after history rewrite ([220e249](https://github.com/ai-driven-dev/aidd-framework/commit/220e2492b372c3e574dce40c9a170e3c8034c5d0))
* **framework:** roll back root version to 3.9.1 for release-please cut ([a2535e7](https://github.com/ai-driven-dev/aidd-framework/commit/a2535e7478941d09aac9e33baaffc13f1345fdec))
* **framework:** self-host summarize-markdown.mjs for per-plugin CATALOG ([ee62862](https://github.com/ai-driven-dev/aidd-framework/commit/ee6286237d3b1b97ebaf67aa68f8152015d61e90))
* **framework:** tighten standalone lefthook checks + schema validation ([749dc5c](https://github.com/ai-driven-dev/aidd-framework/commit/749dc5c206f8642ec7166ae1d95a6bc44744ccdd))
* **framework:** trigger ci recheck after history rewrite ([391760e](https://github.com/ai-driven-dev/aidd-framework/commit/391760e19eb69fe80e098c3aefc3c527cda2169a))
* **framework:** unify version management across marketplace and plugins via release-please ([85d97eb](https://github.com/ai-driven-dev/aidd-framework/commit/85d97eb130d809515c51700554e94adebab0eee6))
* **framework:** verify build-dist.sh against beta.23 + add verification report ([1222e99](https://github.com/ai-driven-dev/aidd-framework/commit/1222e996c12c814465941721cf34439778003a4d))
* **framework:** wave 1 audit fixes (schemas, gitignore, dependabot, links) ([4bcb670](https://github.com/ai-driven-dev/aidd-framework/commit/4bcb67069cd7af57f2a73fb55e19d89a583e2e7d))
* **framework:** wave 5 OSS hygiene on main (evals CI + doctor + labels + scrub routing) ([8a4c409](https://github.com/ai-driven-dev/aidd-framework/commit/8a4c4097edbb7fd866186fbdbf8c74c76b8b7c23))
* **governance:** commit main branch protection ruleset + document policy ([160c457](https://github.com/ai-driven-dev/aidd-framework/commit/160c457c8076e2db45b4fb021850fa45d998d4f7))
* **orchestrator:** drop empty orphan audit unknown-20260514T082959Z ([17f0b48](https://github.com/ai-driven-dev/aidd-framework/commit/17f0b48484906030f28d023b0348f9814495b497))
* **orchestrator:** record async run audit ([12a7e68](https://github.com/ai-driven-dev/aidd-framework/commit/12a7e68b9f4ebe29d51efe4c9ae3af8513c4b12e))
* **orchestrator:** record async run audit auto-20260514T155557Z-i81 ([68119d2](https://github.com/ai-driven-dev/aidd-framework/commit/68119d235c6d7aaa0512e4ff5271331d834bba6b))
* **orchestrator:** record async run audit unknown-20260514T082959Z ([cffd669](https://github.com/ai-driven-dev/aidd-framework/commit/cffd6693db89a151d93615287b9ab0969a5f277c))
* refresh stale references to deleted async-dev skills + three-artifact context-generate ([4697d19](https://github.com/ai-driven-dev/aidd-framework/commit/4697d198e9f45a1c983da362d9c08f6162f1dd9b))
* **release-please:** pin each plugin to release-as 1.0.0 for the v4 marketplace release ([7d0f154](https://github.com/ai-driven-dev/aidd-framework/commit/7d0f154f1d444700539ffef1b1067c3c0db6c90e))
* **release-please:** pin plugins to release-as 1.0.0 for v4 marketplace cut ([e58021d](https://github.com/ai-driven-dev/aidd-framework/commit/e58021d63790bd739f7ddcee206eaed1633eb6fc))
* **release-please:** register orchestrator + refine and bump root to 4.0.0 ([86fed82](https://github.com/ai-driven-dev/aidd-framework/commit/86fed82de2dd973d20e02db0d1d2809266c08568))
* **release-please:** ship aidd-pm as 1.0.0 stable ([624c20f](https://github.com/ai-driven-dev/aidd-framework/commit/624c20f413642bdea04d654cd0c2a78d6af8a7b5))
* **release-please:** ship aidd-pm as 1.0.0 stable (not RC) ([d7e962a](https://github.com/ai-driven-dev/aidd-framework/commit/d7e962a8469ba8386f23d9d66436ad4f17b9e4d3))
* strip obsolete config/, aidd_docs/, and build-dist.sh ([c381602](https://github.com/ai-driven-dev/aidd-framework/commit/c381602801b42cd43b5bb35c487f8d3df2fc3788))


### Documentation

* **aidd-context:** fix [1.3] skill name to match SKILL.md frontmatter (generate-skill) ([9d4192b](https://github.com/ai-driven-dev/aidd-framework/commit/9d4192b682d9fc0c786fef2b10d7062db95dbc2b))
* **aidd-context:** refresh descriptions to cover all seven generated artifacts ([8cbb5a2](https://github.com/ai-driven-dev/aidd-framework/commit/8cbb5a2d6d5b5e5f51aa125cf2066f1322b987fd))
* **aidd-context:** refresh descriptions to cover the seven generated artifacts ([b1bef44](https://github.com/ai-driven-dev/aidd-framework/commit/b1bef44b87d6e02d071b75ce513dfbf0f881a547))
* **aidd-dev:** drop stale reference to 05-ship precondition in SDLC rule ([69853d7](https://github.com/ai-driven-dev/aidd-framework/commit/69853d70d51e4e36713306d92c52e30268909392))
* **aidd-orchestrator:** rewrite README with full local + remote coverage ([ac3b47e](https://github.com/ai-driven-dev/aidd-framework/commit/ac3b47ebe33cdaa58b036750df7142c271300339))
* **aidd-pm:** sync CATALOG.md with current skill state ([44a398e](https://github.com/ai-driven-dev/aidd-framework/commit/44a398e558b20d80e0654a74cfeed58b8e6684c4))
* **contributing:** document commit scope to release-please mapping ([01dc226](https://github.com/ai-driven-dev/aidd-framework/commit/01dc2263f33acb0b94699a62a2e184a82211bd08))
* **contributing:** point at validate.yml after evals.yml consolidation ([6e10a3b](https://github.com/ai-driven-dev/aidd-framework/commit/6e10a3ba1392b151f8dbdf4047960b293bd87a95))
* **framework:** add agents count to stats line ([e35c7fa](https://github.com/ai-driven-dev/aidd-framework/commit/e35c7fa0a80a3ab725a635ed7996d86b1cba98ae))
* **framework:** add AIDD logo asset ([34d1253](https://github.com/ai-driven-dev/aidd-framework/commit/34d12531ec44ac7076a5d43d9b3fe09b0df2f5f7))
* **framework:** add ARCHITECTURE.md — source of truth for plugin structure ([6135b11](https://github.com/ai-driven-dev/aidd-framework/commit/6135b117b4cb6b2d0275a0160fae889a7a6d91f9))
* **framework:** add badges, contributors mosaic, and demo-gif placeholder ([0726cbe](https://github.com/ai-driven-dev/aidd-framework/commit/0726cbef381813c67d0caa0c8220037e21e518d9))
* **framework:** add FAQ, Architecture, Create Plugin guides; clean broken refs ([d9a3c24](https://github.com/ai-driven-dev/aidd-framework/commit/d9a3c2466843a64c90865a50373e6302fc1ae334))
* **framework:** add founder blog link to credit line ([7ad6c53](https://github.com/ai-driven-dev/aidd-framework/commit/7ad6c535ec9c7a395b375333d3c495c007140516))
* **framework:** add GOVERNANCE, ROADMAP, and skills.json aggregator ([e770862](https://github.com/ai-driven-dev/aidd-framework/commit/e770862b30176dc9c3f6f6e0dc5aa655a970b5b4))
* **framework:** add Made in France badge and footer signature ([a0d70b3](https://github.com/ai-driven-dev/aidd-framework/commit/a0d70b3826109e9181a3892fcc33e87f8c3a1d19))
* **framework:** add maintainer release playbook ([e80415a](https://github.com/ai-driven-dev/aidd-framework/commit/e80415a0eef76337ccba5bce73f0489b24a9573c))
* **framework:** add maintainer release playbook ([b74fe5b](https://github.com/ai-driven-dev/aidd-framework/commit/b74fe5bbe445d3c84888cb0abac264a3c31265ec))
* **framework:** add per-plugin CATALOG.md (auto-generated) ([d613282](https://github.com/ai-driven-dev/aidd-framework/commit/d61328242639bb77909055019629b1da3891bffc))
* **framework:** add v3 to v4 upgrade guide ([63a9419](https://github.com/ai-driven-dev/aidd-framework/commit/63a94198d07920b6977aba04e3b154f9aac47eff))
* **framework:** add v3 to v4 upgrade guide ([594f8db](https://github.com/ai-driven-dev/aidd-framework/commit/594f8db9adac7ca42f5adb32658ce222318a3821))
* **framework:** clarify onboard skill scope in Quick start ([af8d6ef](https://github.com/ai-driven-dev/aidd-framework/commit/af8d6eff97a67c41866d5a3565f12f12ae09f06c))
* **framework:** document prerequisites for users and contributors ([074c76c](https://github.com/ai-driven-dev/aidd-framework/commit/074c76c27f5dc4f550dd3a6d75b3a39f0d16e25c))
* **framework:** drop contributors section, add 4 static badges ([9875a73](https://github.com/ai-driven-dev/aidd-framework/commit/9875a738acb3247bb7b61f34f8e7b58c62d7f99a))
* **framework:** drop evals badge and quick-start mermaid ([fb042b4](https://github.com/ai-driven-dev/aidd-framework/commit/fb042b46803e013eaff5c4535040848f9502d027))
* **framework:** drop orphan aidd_docs/CATALOG.md ([c0bb1e2](https://github.com/ai-driven-dev/aidd-framework/commit/c0bb1e2642d16bd219a2e74b1e206b11474362dc))
* **framework:** explicit positioning vs claude-plugins-official ([dc395b2](https://github.com/ai-driven-dev/aidd-framework/commit/dc395b25b7580ba980f131dac52fead23f560ca2))
* **framework:** fix YouTube link and credit Alex Soyes as founder ([16449f1](https://github.com/ai-driven-dev/aidd-framework/commit/16449f1834787946ad7eb68c980247fd4a04a1f1))
* **framework:** keep only static badges and link contributors graph while repo is private ([a60b09f](https://github.com/ai-driven-dev/aidd-framework/commit/a60b09fdb791c5b5ca16ef847217f4803518fb15))
* **framework:** reframe AI-Driven Dev section as community + flow + tools ([e64d323](https://github.com/ai-driven-dev/aidd-framework/commit/e64d323add84772b5ac71e2f3daeee227a1b56e8))
* **framework:** replace founder YouTube link with GitHub, LinkedIn, X ([34076ed](https://github.com/ai-driven-dev/aidd-framework/commit/34076ed1fba7769b8b204a66b8b90425f7113a11))
* **framework:** rewrite for plugin marketplace model ([9529d4c](https://github.com/ai-driven-dev/aidd-framework/commit/9529d4cbc8fef430354300e2bfcd8bff526c67a2))
* **framework:** rewrite ROADMAP around user-stated direction ([bc581d6](https://github.com/ai-driven-dev/aidd-framework/commit/bc581d6da7a14c3788c39352e73e0f5a9d9100ba))
* **framework:** rewrite top-level README for OSS readiness ([f8eb385](https://github.com/ai-driven-dev/aidd-framework/commit/f8eb385f9d720a2b54772c9d30826990ee91c02a))
* **framework:** scaffold aidd_docs and replace ARCHITECTURE.md ([3a91267](https://github.com/ai-driven-dev/aidd-framework/commit/3a9126772bbe07bdba23c2b11c14d14588f5d80b))
* **framework:** sync READMEs and CATALOGs with current skills ([16c9372](https://github.com/ai-driven-dev/aidd-framework/commit/16c937268b27a6e80f4077da4989003be5d9d186))
* **framework:** update CATALOG.md ([d921bfd](https://github.com/ai-driven-dev/aidd-framework/commit/d921bfd6f68f81946e172cc49cc7969cf20ce276))
* **framework:** update feature request template and contributing guidelines ([1592df3](https://github.com/ai-driven-dev/aidd-framework/commit/1592df36e5c3ebad2943ca624a6c07c5da1d5d00))
* **framework:** wow README hero, plugin grid, quick-start Mermaid ([bcbd00c](https://github.com/ai-driven-dev/aidd-framework/commit/bcbd00cd3fd01f259750e4d28cb34890a9711677))
* **orchestrator:** add async-dev lifecycle state diagram to run skill README ([ac4c867](https://github.com/ai-driven-dev/aidd-framework/commit/ac4c8672159549ef8d4e85141f8beabe75c36271))
* **orchestrator:** align README with sibling plugin pattern + add to framework catalog ([7c62edd](https://github.com/ai-driven-dev/aidd-framework/commit/7c62edde873b94e046a94517833100eec35feddc))
* **orchestrator:** restructure plugin and per-skill READMEs ([cb841de](https://github.com/ai-driven-dev/aidd-framework/commit/cb841def85c91905d137820ac3e9467d217f5da4))
* phase 1 critical audit fixes (skill invocations, catalog, templates) ([5b5342b](https://github.com/ai-driven-dev/aidd-framework/commit/5b5342b890ae0be4eb8302fd36e5a4d8882b9cbb))
* phase 2 high-severity audit fixes (security, lefthook, accuracy) ([95f29c3](https://github.com/ai-driven-dev/aidd-framework/commit/95f29c33c6a523166eaf09e0293000ee356a27dd))
* phase 3 medium/low audit fixes (OSS scaffolding, UX, accuracy) ([5e43650](https://github.com/ai-driven-dev/aidd-framework/commit/5e436502d7632b377f73129cfb73d312c3eea9ce))
* propagate per-skill README pattern across all plugins ([4427e3e](https://github.com/ai-driven-dev/aidd-framework/commit/4427e3ee7c096d03f7d7b30d418f3484e9d0541a))
* **readme:** bump skill count 32 to 33 ([87d2324](https://github.com/ai-driven-dev/aidd-framework/commit/87d232406536e02a1ffaf2f33e3a7ea9901c4ea2))
* **readme:** bump skill count 32 to 33 ([14a724a](https://github.com/ai-driven-dev/aidd-framework/commit/14a724ac5bc229ba8675aaade32636ae32af30de))
* scrub cross-plugin references from skill READMEs ([9c23973](https://github.com/ai-driven-dev/aidd-framework/commit/9c2397396c16a80a04f66991a2ae6bd92dcce5d0))


### Refactoring

* **aidd-context:** align audit fixes across 04-mermaid, 01-bootstrap, 02-project-init, 03-context-generate, 05-learn ([8f69261](https://github.com/ai-driven-dev/aidd-framework/commit/8f692619beb1e90b3154134d4cb0c7cc795036db))
* **aidd-context:** cross-tool prompts, .gitkeep enforcement, plugin-based README, CONTRIBUTING ([04e74c6](https://github.com/ai-driven-dev/aidd-framework/commit/04e74c605bbd574fd87a5b58ebab1d366b043b34))
* **aidd-context:** merge 09-generate-skill into 03-context-generate with skills/ subfolder ([e9aa546](https://github.com/ai-driven-dev/aidd-framework/commit/e9aa546051620f7300c8a751e0b098a25e566217))
* **aidd-context:** remove architecture-generate skill and renumber project-init to 02 ([1e80beb](https://github.com/ai-driven-dev/aidd-framework/commit/1e80bebfbbee2dfb0f3314cba46a0f8155bcc7f1))
* **aidd-context:** restructure project init ([da90ed8](https://github.com/ai-driven-dev/aidd-framework/commit/da90ed8ac6c53aff7d1fae6d49477f4b1089a029))
* **aidd-dev:** restructure 00-sdlc as router with 5 atomic actions ([b9653b7](https://github.com/ai-driven-dev/aidd-framework/commit/b9653b75f8ba37e7c8fc1088ec393ce71e90d75d))
* **aidd-dev:** rewrite SDLC as pure orchestrator with role-based agents ([dbc6edd](https://github.com/ai-driven-dev/aidd-framework/commit/dbc6edd360256154a14a82fb206b301b77684822))
* **aidd-orchestrator:** observe-reality + YAML-owned lifecycle ([5b64b4a](https://github.com/ai-driven-dev/aidd-framework/commit/5b64b4aef9cb77898244ca8c81d539bc46473760))
* **aidd-orchestrator:** observe-reality verification + YAML-owned lifecycle ([d193b99](https://github.com/ai-driven-dev/aidd-framework/commit/d193b9935a5a8d318c6432aa1d587793c9d7114f))
* **aidd-pm:** restructure spec into build and refine actions, sync plugin docs ([107241e](https://github.com/ai-driven-dev/aidd-framework/commit/107241e76e444d6afeef8d767ed1501c972ef338))
* **aidd-vcs:** rewrite skills to canonical template with tool-agnostic process ([661f73b](https://github.com/ai-driven-dev/aidd-framework/commit/661f73b8825514cb3d0b8a734981f8c9d98054b0))
* **framework:** align sdlc orchestrator and sub-skills around alex baseline ([92535cd](https://github.com/ai-driven-dev/aidd-framework/commit/92535cdf285effeee4cba9027dd7fd6a88c8c737))
* **framework:** canonical action shape, model-A rules, plugin audit sweep ([29ef579](https://github.com/ai-driven-dev/aidd-framework/commit/29ef579a683302c28f23de383acc1912ebcfe01e))
* **framework:** canonical template for aidd-pm skills + tighter SKILL.md descriptions ([0ea9b80](https://github.com/ai-driven-dev/aidd-framework/commit/0ea9b8021320778e64fb1c3806eb59eabfb6130c))
* **framework:** extract meta-cognition skills into dedicated plugin ([2bf0b6e](https://github.com/ai-driven-dev/aidd-framework/commit/2bf0b6e5e8cb2d300808332cbe68af626d72009f))
* **framework:** make content tool-agnostic and self-contained ([84165a9](https://github.com/ai-driven-dev/aidd-framework/commit/84165a917c9c36b6bca10599e9f4699908bd79ba))
* **framework:** move ide-mapping rules to aidd-context plugin ([791ac84](https://github.com/ai-driven-dev/aidd-framework/commit/791ac849e94e53bff674e3b6b295b1e351337b3f))
* **framework:** remove embedded skill content for distribution-mode migration ([ee43a32](https://github.com/ai-driven-dev/aidd-framework/commit/ee43a323505791ffb7d41395539c7bc665e8a6c5))
* **framework:** rename skill folders from [X.X] to NN-name format ([c8968bc](https://github.com/ai-driven-dev/aidd-framework/commit/c8968bc79dd7f24976392a6bce0c7f30c35b2ede))
* **framework:** unify plan/status/tracking into living plan template ([180c504](https://github.com/ai-driven-dev/aidd-framework/commit/180c5047750f5aaf6093c425cec9ce6657ca3ad9))
* generate_skill ([4a8e9bb](https://github.com/ai-driven-dev/aidd-framework/commit/4a8e9bb2adff0a7aca2933c5384dfa1cda7670b5))
* **plugin:** rename aidd-async-dev to aidd-orchestrator ([4cb0f71](https://github.com/ai-driven-dev/aidd-framework/commit/4cb0f71d1beaf6d991d71a4d73405b3a3357c6c3))
* **plugin:** suffix skill names with -async-dev for self-documentation ([c19a5a4](https://github.com/ai-driven-dev/aidd-framework/commit/c19a5a4c5ade09f129158defb3899e63d2598a6b))

## [3.9.1](https://github.com/ai-driven-dev/aidd-framework/compare/v3.9.0...v3.9.1) (2026-04-23)


### Bug Fixes

* **ci:** include base MCP servers in per-tool release tarballs ([01de4ab](https://github.com/ai-driven-dev/aidd-framework/commit/01de4ab7af2e7f08bf4f112878f10f8ea8ef1f44))
* **commands:** align review_functional with behavioral review intent ([d1b6d94](https://github.com/ai-driven-dev/aidd-framework/commit/d1b6d944f98827f96a16139aea7a209415a3a64b))
* **commands:** align review_functional with behavioral review intent ([f0d27eb](https://github.com/ai-driven-dev/aidd-framework/commit/f0d27ebfabc12c6c87801c38c7a51d3da12f942d)), closes [#72](https://github.com/ai-driven-dev/aidd-framework/issues/72)

## [3.9.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.8.1...v3.9.0) (2026-04-22)


### Features

* **config:** split vscode and copilot settings into separate directories ([f0e585e](https://github.com/ai-driven-dev/aidd-framework/commit/f0e585e0d2548573b4071bac9e5915dc91baecfb))
* **config:** split vscode and copilot settings into separate directories ([826207b](https://github.com/ai-driven-dev/aidd-framework/commit/826207b9e48137f693544408d8b90913ae445140))


### Bug Fixes

* **ci:** update build-dist.sh for --ai/--ide CLI flags and vscode bundling ([c2860e4](https://github.com/ai-driven-dev/aidd-framework/commit/c2860e4b59b9538c9ba7b2a79cabc0b54efea675))
* **docs:** replace hardcoded .claude paths with {{TOOLS}} placeholder ([f5902f6](https://github.com/ai-driven-dev/aidd-framework/commit/f5902f6b3ed70b530b6f640b5e1eb6fead545793))
* **template:** complete truncated task placeholder in plan.md ([088b1d7](https://github.com/ai-driven-dev/aidd-framework/commit/088b1d796c66cfd4d96c3756d082060284daae59))
* **template:** complete truncated task placeholder in plan.md ([5afde32](https://github.com/ai-driven-dev/aidd-framework/commit/5afde32d3e0c4f3ed7e500176bf4f9cf92aa7b06))
* **template:** complete truncated task placeholder in plan.md ([f4dd9fc](https://github.com/ai-driven-dev/aidd-framework/commit/f4dd9fc2f1f3fb5e0a0031dc413137e720c13e5c))

## [3.8.1](https://github.com/ai-driven-dev/aidd-framework/compare/v3.8.0...v3.8.1) (2026-04-15)


### Bug Fixes

* **commands:** make VCS/ticketing references provider-agnostic ([df4e7cc](https://github.com/ai-driven-dev/aidd-framework/commit/df4e7ccf36e2704233446fbd371150728095e7d1))
* **commands:** make VCS/ticketing references provider-agnostic ([bf50a79](https://github.com/ai-driven-dev/aidd-framework/commit/bf50a791862eddf6aa29b2f8a3a4470ca5333b3f))
* **commands:** move CLI/MCP preference to vcs.md memory template ([7756e04](https://github.com/ai-driven-dev/aidd-framework/commit/7756e04d60dc3c7b1389d2af24913929bca9653f))
* **commands:** separate VCS and ticketing abstractions ([5f89bd0](https://github.com/ai-driven-dev/aidd-framework/commit/5f89bd0ba5ee992000629546c002d8ad2db85783))
* **init:** add missing @ prefix to agents_coordination.md reference ([54889e0](https://github.com/ai-driven-dev/aidd-framework/commit/54889e0bed4cfb9180be8f6bf348681976a4043a))
* **init:** add missing @ prefix to agents_coordination.md reference ([ca63160](https://github.com/ai-driven-dev/aidd-framework/commit/ca6316032287b07a41f4013ba4edf1ba17229b64))
* **memory:** remove inline annotations from vcs.md template ([b55c775](https://github.com/ai-driven-dev/aidd-framework/commit/b55c7758748ac80c37fce525583578863a58c20e))

## [3.8.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.7.3...v3.8.0) (2026-04-05)


### Features

* **onboard:** add /onboard wizard command for new users ([17e7b5c](https://github.com/ai-driven-dev/aidd-framework/commit/17e7b5cee5fc152a93b0ff7e44dd9ed638ccaadd))
* **onboard:** add /onboard wizard command for new users ([b02e173](https://github.com/ai-driven-dev/aidd-framework/commit/b02e173814d10ed2c66990b0844cc1b6afa2c599)), closes [#33](https://github.com/ai-driven-dev/aidd-framework/issues/33)


### Bug Fixes

* **build-dist:** use aidd setup --tools to include docs in dist ([f99a84c](https://github.com/ai-driven-dev/aidd-framework/commit/f99a84cb6b73b839a38710917eb805622772f90a))
* **memory:** make update_memory.js ESM-compatible with dynamic imports ([e671211](https://github.com/ai-driven-dev/aidd-framework/commit/e671211b11b3f06dbbbaeea1d76062305a83ae03))
* **memory:** make update_memory.js ESM-compatible with dynamic imports ([0b0f68e](https://github.com/ai-driven-dev/aidd-framework/commit/0b0f68e8a2b3367b920efbbb739c38e1c01ba01d))


### Documentation

* remove discord README from main, belongs on feat/pm only ([435482f](https://github.com/ai-driven-dev/aidd-framework/commit/435482f582e18f78eed49e1643781bf2a54e8c89))

## [3.7.3](https://github.com/ai-driven-dev/aidd-framework/compare/v3.7.2...v3.7.3) (2026-03-24)


### Bug Fixes

* **ci:** update build-dist.sh to use current CLI API ([29b301a](https://github.com/ai-driven-dev/aidd-framework/commit/29b301a42e3cf287f1fccc3d9744089bb5e28ea1))
* **memory:** convert update_memory script to CommonJS and add ls fallback ([5a31567](https://github.com/ai-driven-dev/aidd-framework/commit/5a3156785eda21f10578d7b869e55c7e719dc482))


### Documentation

* add reporting issues section with issue templates ([428bfc0](https://github.com/ai-driven-dev/aidd-framework/commit/428bfc06edecb555a5513d966c00e468d3a20549))
* **release:** add pm.2 discord README and CHANGELOG entry ([1beba46](https://github.com/ai-driven-dev/aidd-framework/commit/1beba466392596996ee23c82a7f87e380aba2485))
* **rules:** add frontmatter description to ide-mapping files ([eb1dd38](https://github.com/ai-driven-dev/aidd-framework/commit/eb1dd38c5763bb7258b79f6f077b1058afd1e639))

## [3.7.1-pm.2](https://github.com/ai-driven-dev/aidd-framework/releases/tag/v3.7.1-pm.2) (2026-03-22) - Beta pre-release

> ⚠️ Pre-release expérimentale. Pas proposée automatiquement aux utilisateurs existants.
> Install : `aidd setup --release v3.7.1-pm.2` ou `aidd update --release v3.7.1-pm.2`

Cette release expérimente une approche différente : **agents et skills plutôt que commandes SDLC**.
Chaque agent orchestre ses propres skills avec des gates de challenge intégrées.
Rien n'est ancré - feedback et itérations bienvenus.

### Features

* **pm:** add brownfield and greenfield workflow commands (`/brownfield`, `/greenfield`)
* **agents:** add Oriane (PM), Ariane (Architect), Diane (UX), Eva (Impact), Justine (Challenger), Claire (Clarity)
* **skills/pm:** add `pm-constitution`, `pm-product-brief`, `pm-prd`, `pm-user-stories`, `pm-system-overview`, `pm-change-brief`, `pm-change-spec`
* **skills/arch:** add `architecture-decision`, `architecture-milestones`, `architecture-impact`, `architecture-impact-plan`
* **skills/ux:** add `ux-design-system`, `ux-flow-map`, `ux-accessibility`, `ux-copywriting`, `ux-audit` (greenfield)
* **skills/ux:** add `ux-design-system-update`, `ux-flow-update`, `ux-accessibility-update`, `ux-copywriting-update` (brownfield)
* **skills:** add `spike` for time-boxed investigations (available to all agents)
* **skills:** add `challenge-methods` with 7 structured challenge techniques
* **templates/pm:** add `brief`, `discovery_package`, `persona`, `milestones`, `gap_report` templates

### Improvements

* Challenge gates on every skill - structural validation before presenting any deliverable
* Upstream reconciliation (bidirectional): deduplication + constraint propagation
* Business-level language enforced in `pm-constitution`
* Agent single-responsibility strictly enforced, aligned with course materials

### Bug Fixes

* Restore `create_user_stories` command removed during rebase
* Remove duplicate challenge skill

## [3.7.2](https://github.com/ai-driven-dev/aidd-framework/compare/v3.7.1...v3.7.2) (2026-03-20)


### Bug Fixes

* **ci:** include .aidd in per-tool tarballs ([7f56c21](https://github.com/ai-driven-dev/aidd-framework/commit/7f56c2130f115230b5723739b0e528b8a9853553))

## [3.7.1](https://github.com/ai-driven-dev/aidd-framework/compare/v3.7.0...v3.7.1) (2026-03-19)


### Bug Fixes

* **plan:** remove implementation references from steps ([4637864](https://github.com/ai-driven-dev/aidd-framework/commit/46378641a05bfd8dfd5acea033b9f78193efb4ea))

## [3.7.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.6.0...v3.7.0) (2026-03-19)


### Features

* **memory:** add update_memory script and sync &lt;aidd_project_memory&gt; block ([ebaca02](https://github.com/ai-driven-dev/aidd-framework/commit/ebaca0262b21b087fbc39b00f7a3ef949cdca623))
* **memory:** add update_memory script and sync aidd_project_memory block ([f950ee5](https://github.com/ai-driven-dev/aidd-framework/commit/f950ee5d8ad00a0b5b7efd86d465cc6173769ddb))

## [3.6.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.5.0...v3.6.0) (2026-03-16)


### Features

* **tooling:** add opencode to build-dist script ([cb8a1a7](https://github.com/ai-driven-dev/aidd-framework/commit/cb8a1a75679ab3474fb9dcdcb9e612157b6c4424))

## [3.5.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.4.4...v3.5.0) (2026-03-16)


### Features

* **tooling:** add OpenCode config and syntax reference ([a70f3d0](https://github.com/ai-driven-dev/aidd-framework/commit/a70f3d0383f5f48604a29fa209fe69eb8465c7e7))

## [3.4.4](https://github.com/ai-driven-dev/aidd-framework/compare/v3.4.3...v3.4.4) (2026-03-10)


### Bug Fixes

* remove unnecessary metadata from IDE mapping files ([839d8f1](https://github.com/ai-driven-dev/aidd-framework/commit/839d8f1d121dbb44e9f3710627ffbbdfdd4d2f04))


### Documentation

* **contributing:** clarify which commit types appear in changelog ([501ff07](https://github.com/ai-driven-dev/aidd-framework/commit/501ff075535b828586f4122417ed6902dd23d68d))

## [3.4.3](https://github.com/ai-driven-dev/aidd-framework/compare/v3.4.2...v3.4.3) (2026-03-10)


### Documentation

* update README links to use relative paths and remove unnecessary markdown block ([2ff99ec](https://github.com/ai-driven-dev/aidd-framework/commit/2ff99ec66364061a5814296bdc430871a01aec35))

## [3.4.2](https://github.com/ai-driven-dev/aidd-framework/compare/v3.4.1...v3.4.2) (2026-03-09)


### Miscellaneous

* remove sync-dist.js replaced by aidd-cli ([a78e004](https://github.com/ai-driven-dev/aidd-framework/commit/a78e004968ac2dae3c9c1b4096143d2130fd4fcf))

## [3.4.1](https://github.com/ai-driven-dev/aidd-framework/compare/v3.4.0...v3.4.1) (2026-03-09)


### Bug Fixes

* use PACKAGES_TOKEN secret for GitHub Packages auth ([7785719](https://github.com/ai-driven-dev/aidd-framework/commit/7785719487631ab1278da83545451ffe67171a2d))

## [3.4.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.3.4...v3.4.0) (2026-03-09)


### Features

* replace sync-dist.js with aidd-cli for dist generation ([a2815a6](https://github.com/ai-driven-dev/aidd-framework/commit/a2815a68e0eb8669c62d1315a9bcab91fa52fa90))
* replace sync-dist.js with aidd-cli for dist generation ([6fe6b3b](https://github.com/ai-driven-dev/aidd-framework/commit/6fe6b3b0e12cf77896da7aacd6ab82c6d990b9e7))

## [3.3.4](https://github.com/ai-driven-dev/aidd-framework/compare/v3.3.3...v3.3.4) (2026-03-09)


### Bug Fixes

* update link to CATALOG.md in README ([6a9c2e7](https://github.com/ai-driven-dev/aidd-framework/commit/6a9c2e7c2aab121b7f76632c8eae3f27586c626b))
* update links to CATALOG.md in README for consistency ([5990084](https://github.com/ai-driven-dev/aidd-framework/commit/59900843ebc5cddf9d653f75409ab2e7fbd54d84))

## [3.3.3](https://github.com/ai-driven-dev/aidd-framework/compare/v3.3.2...v3.3.3) (2026-03-07)


### Bug Fixes

* link to coding assertions documentation ([593f3ad](https://github.com/ai-driven-dev/aidd-framework/commit/593f3adc550db7835df16b767b316d1b6d4f1bbe))

## [3.3.2](https://github.com/ai-driven-dev/aidd-framework/compare/v3.3.1...v3.3.2) (2026-03-06)


### Bug Fixes

* update flowchart in README for clarity and accuracy ([8bd7e6f](https://github.com/ai-driven-dev/aidd-framework/commit/8bd7e6f032a0de47f92720112a4e084b97f6f8dc))


### Documentation

* update CONTRIBUTING and README to clarify versioning and release process ([843ba73](https://github.com/ai-driven-dev/aidd-framework/commit/843ba73f942546139d23a2b6388c1b1e3ebe252e))


### CI

* add commitlint pre-commit hook and GitHub Actions workflow ([9c9711c](https://github.com/ai-driven-dev/aidd-framework/commit/9c9711c3b556a27867b43d98a57e0fa4f43efd12))
* make pre-commit and pre-push hooks blocking ([39dddcd](https://github.com/ai-driven-dev/aidd-framework/commit/39dddcd9022e3a01ee6eba79bbbcca1d590d74a8))
* rename commitlint config to .cjs ([9b881bb](https://github.com/ai-driven-dev/aidd-framework/commit/9b881bb3de97c7db7287a9ed12125ec239b86b10))
* update commitlint workflow to use .cjs config ([66d0485](https://github.com/ai-driven-dev/aidd-framework/commit/66d0485b0a7e2e237a993a4b480f8373b8db3fbc))

## [3.3.1](https://github.com/ai-driven-dev/aidd-framework/compare/v3.3.0...v3.3.1) (2026-03-05)


### Bug Fixes

* correct broken agents coordination guide link in aidd_docs README ([72985d0](https://github.com/ai-driven-dev/aidd-framework/commit/72985d0872b94ba95afc6c0b9a53f40c7e1b5821)), closes [#7](https://github.com/ai-driven-dev/aidd-framework/issues/7)

## [3.3.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.2.2...v3.3.0) (2026-03-05)


### Features

* add golden principles for agent guidelines ([3e84550](https://github.com/ai-driven-dev/aidd-framework/commit/3e84550a90cccab14edeb0a2d2ce5da11c5d4412))


### Bug Fixes

* clarify mermaid node ID and label naming rules ([94f4611](https://github.com/ai-driven-dev/aidd-framework/commit/94f46112fd070e21c550e2e98b20516d92dc2034)), closes [#10](https://github.com/ai-driven-dev/aidd-framework/issues/10)
* correct review_code template path from aidd/ to dev/ ([4118de9](https://github.com/ai-driven-dev/aidd-framework/commit/4118de932c308185da71f471ea5f78545fe93cd2)), closes [#11](https://github.com/ai-driven-dev/aidd-framework/issues/11)
* exclude non-essential files from release tarball ([a4871f2](https://github.com/ai-driven-dev/aidd-framework/commit/a4871f2bdd302b5eba45ac0f69f1f58df6ecf5fb))
* remove empty templates/ from tarball include list ([d06ac8b](https://github.com/ai-driven-dev/aidd-framework/commit/d06ac8bb4967740ace0e785c3fef88e2e5a03cd9))
* switch tarball to include-based approach and reset version to 3.2.2 ([5a6276c](https://github.com/ai-driven-dev/aidd-framework/commit/5a6276cc92fd98efc4a0fee4beab755bfb738490))
* update globs to include Markdown files for Mermaid diagram rules ([91727cf](https://github.com/ai-driven-dev/aidd-framework/commit/91727cf9920066241b8f18b925c915854290ca73))


### Build

* exclude dev files from tarball and add version.txt ([e25d77d](https://github.com/ai-driven-dev/aidd-framework/commit/e25d77da254ac982c9c27fa25cd33203391e8f61))


### Miscellaneous

* **main:** release 3.2.3 ([2ec6412](https://github.com/ai-driven-dev/aidd-framework/commit/2ec64128273a55694a2f5ef282b17d33a77d199a))
* **main:** release 3.2.3 ([d624b9f](https://github.com/ai-driven-dev/aidd-framework/commit/d624b9f8332c1565cf639fce9940275b1bfe96bc))
* **main:** release 3.3.0 ([3d56acf](https://github.com/ai-driven-dev/aidd-framework/commit/3d56acff3565b3ce4587c9a216af9532f245b7e7))
* **main:** release 3.3.0 ([e5ba343](https://github.com/ai-driven-dev/aidd-framework/commit/e5ba3437b15092f4cf12ed667ca8d578ea485243))
* **main:** release 4.0.0 ([e8c3ee2](https://github.com/ai-driven-dev/aidd-framework/commit/e8c3ee2a2618da94c98905fe8edbbbb10c6bc17f))
* **main:** release 4.0.0 ([584477a](https://github.com/ai-driven-dev/aidd-framework/commit/584477a36bdada60aaf69135c48497a5128a173f))
* reset version to 3.2.2 to bridge gap from deleted malware releases ([541e210](https://github.com/ai-driven-dev/aidd-framework/commit/541e2108b807c47906cd70233dc6a15f6c09590c))


### CI

* add statuses write permission to lint-pr workflow ([4ad953f](https://github.com/ai-driven-dev/aidd-framework/commit/4ad953fbf4dd455c3a8d2999ff5fc956d6766d1a))

## [3.3.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.2.2...v3.3.0) (2026-03-05)


### Features

* add golden principles for agent guidelines ([3e84550](https://github.com/ai-driven-dev/aidd-framework/commit/3e84550a90cccab14edeb0a2d2ce5da11c5d4412))


### Bug Fixes

* clarify mermaid node ID and label naming rules ([94f4611](https://github.com/ai-driven-dev/aidd-framework/commit/94f46112fd070e21c550e2e98b20516d92dc2034)), closes [#10](https://github.com/ai-driven-dev/aidd-framework/issues/10)
* correct review_code template path from aidd/ to dev/ ([4118de9](https://github.com/ai-driven-dev/aidd-framework/commit/4118de932c308185da71f471ea5f78545fe93cd2)), closes [#11](https://github.com/ai-driven-dev/aidd-framework/issues/11)
* exclude non-essential files from release tarball ([a4871f2](https://github.com/ai-driven-dev/aidd-framework/commit/a4871f2bdd302b5eba45ac0f69f1f58df6ecf5fb))
* switch tarball to include-based approach and reset version to 3.2.2 ([5a6276c](https://github.com/ai-driven-dev/aidd-framework/commit/5a6276cc92fd98efc4a0fee4beab755bfb738490))
* update globs to include Markdown files for Mermaid diagram rules ([91727cf](https://github.com/ai-driven-dev/aidd-framework/commit/91727cf9920066241b8f18b925c915854290ca73))


### Build

* exclude dev files from tarball and add version.txt ([e25d77d](https://github.com/ai-driven-dev/aidd-framework/commit/e25d77da254ac982c9c27fa25cd33203391e8f61))


### Miscellaneous

* **main:** release 3.2.3 ([2ec6412](https://github.com/ai-driven-dev/aidd-framework/commit/2ec64128273a55694a2f5ef282b17d33a77d199a))
* **main:** release 3.2.3 ([d624b9f](https://github.com/ai-driven-dev/aidd-framework/commit/d624b9f8332c1565cf639fce9940275b1bfe96bc))
* **main:** release 4.0.0 ([e8c3ee2](https://github.com/ai-driven-dev/aidd-framework/commit/e8c3ee2a2618da94c98905fe8edbbbb10c6bc17f))
* **main:** release 4.0.0 ([584477a](https://github.com/ai-driven-dev/aidd-framework/commit/584477a36bdada60aaf69135c48497a5128a173f))


### CI

* add statuses write permission to lint-pr workflow ([4ad953f](https://github.com/ai-driven-dev/aidd-framework/commit/4ad953fbf4dd455c3a8d2999ff5fc956d6766d1a))

## [4.0.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.2.3...v4.0.0) (2026-03-05)


### ⚠ BREAKING CHANGES

* move PM commands for approval

### Features

* add .gitignore to exclude tool-specific directories ([fb7fc1c](https://github.com/ai-driven-dev/aidd-framework/commit/fb7fc1c46329c076bcea7c6e86731f1731fbc6b0))
* add ASCII user journey diagram for improved understanding and validation in implementation plans ([a2587f0](https://github.com/ai-driven-dev/aidd-framework/commit/a2587f0d8ed4f006a806c1afc9e9e6682b55e35c))
* add assert_architecture command to verify code conformity with architecture standards ([5e02c67](https://github.com/ai-driven-dev/aidd-framework/commit/5e02c670699705924d21470f605e0b58280dfea9))
* add confidence level prompt to challenge output and update plan rules for configuration preparation ([6c5c8e1](https://github.com/ai-driven-dev/aidd-framework/commit/6c5c8e1bdb90d2e80f7e0ae43ecd827513f952b5))
* add generate_architecture command and establish command structure standards ([52cc952](https://github.com/ai-driven-dev/aidd-framework/commit/52cc9524817851c02c6d355848961188d1cdc6a3))
* add golden principles for agent guidelines ([3e84550](https://github.com/ai-driven-dev/aidd-framework/commit/3e84550a90cccab14edeb0a2d2ce5da11c5d4412))
* add guideline to split phases based on responsibilities in plan generation ([09403fe](https://github.com/ai-driven-dev/aidd-framework/commit/09403febdf91ea49a4eacd9ba1594e0e192afa09))
* add INSTALL_README.md template for per-tool dist ([0395c0e](https://github.com/ai-driven-dev/aidd-framework/commit/0395c0efb73de1dfa340e77de6ea5620f4894ac3))
* add JSONC comment stripping and .vscode/settings.json generation for Claude tool ([1ddac51](https://github.com/ai-driven-dev/aidd-framework/commit/1ddac51f1a9204e0f4a7f0896a5f0802970d2851))
* add lefthook child-to-parent delegation + auto-install ([6527e6d](https://github.com/ai-driven-dev/aidd-framework/commit/6527e6d4494fd6c484be219815472014a9a97ccc))
* add permissions configuration to settings.json for enhanced security ([0ced082](https://github.com/ai-driven-dev/aidd-framework/commit/0ced08248ba5aee4efa415e732453c05a3a92787))
* add prompt template and update CATALOG reference ([ac57bf9](https://github.com/ai-driven-dev/aidd-framework/commit/ac57bf9af81feab4ce8fbe49fbb71ba81c8b20e5))
* add scaffoldEmptyRuleCategories and brand prefix for commands ([3cc6dc4](https://github.com/ai-driven-dev/aidd-framework/commit/3cc6dc4a928888e47e0cfebf054f960e9bc19415))
* add settings.json to configure Gitignore behavior ([180d0e9](https://github.com/ai-driven-dev/aidd-framework/commit/180d0e9fc87420c54cb2d9aa7d2bad7f77e2b349))
* add ticket_info command and remove jira_info command ([fb3e494](https://github.com/ai-driven-dev/aidd-framework/commit/fb3e494ed1d85780b1a647487af2ebd41c6bb604))
* clarify header title definition in Mermaid generation rules ([3c2521c](https://github.com/ai-driven-dev/aidd-framework/commit/3c2521c61a24804a30fa97becfcd224064337871))
* enhance documentation for challenge skill and add mermaid generation rules ([2e3ab24](https://github.com/ai-driven-dev/aidd-framework/commit/2e3ab24f91e11509e70d77a8a541e9331946e922))
* enhance README structure and clarity with improved formatting and additional sections ([a586ac7](https://github.com/ai-driven-dev/aidd-framework/commit/a586ac7b6cae2a4c76c1577ae6f0f795ec428ff6))
* enhance run_projection documentation to emphasize file architecture relevance ([f051c03](https://github.com/ai-driven-dev/aidd-framework/commit/f051c03f25d7ddc083cd437a19a424b31495e852))
* improve formatting and organization of agent and command sections in README ([c3b3286](https://github.com/ai-driven-dev/aidd-framework/commit/c3b3286009c82a12cb1bbbd8de6af93a5087c2ff))
* improve formatting and organization of agents and commands sections in README ([ae5bc08](https://github.com/ai-driven-dev/aidd-framework/commit/ae5bc08cc54784e62a51f1cf9bb8d5c962a78fc6))
* initial migration of AIDD Framework from monorepo ([1785eed](https://github.com/ai-driven-dev/aidd-framework/commit/1785eed37b34339aad0fb684e1994485e4c81406))
* new CATALOG and prompt templates ([a12e196](https://github.com/ai-driven-dev/aidd-framework/commit/a12e196e67637d6735350f595835c8cf05e16b59))
* redraw aidd_docs/ ([494a0d3](https://github.com/ai-driven-dev/aidd-framework/commit/494a0d335921cec05d422e0b29a5d5edfee46dc6))
* remove improve_prompt and isolate commands from the framework catalog ([b969e79](https://github.com/ai-driven-dev/aidd-framework/commit/b969e79dc2542fbb643fdf9789b9b227ba083347))
* remove optional context section from isolate command documentation ([ba61286](https://github.com/ai-driven-dev/aidd-framework/commit/ba61286e43bb56124c18b2e99e9c9af17417257d))
* revert prompts template and update CATALOG structure ([e2afdff](https://github.com/ai-driven-dev/aidd-framework/commit/e2afdfff32a63bb48f82c514a9a37d27e0d3f55f))
* update agent and command documentation for improved clarity and consistency ([1ee6d7b](https://github.com/ai-driven-dev/aidd-framework/commit/1ee6d7b80d876bff1344e2633ab464e09ab63059))
* update agent models to include new configurations ([6dcbc38](https://github.com/ai-driven-dev/aidd-framework/commit/6dcbc38eb19b3c43181652d196a58f4eac6eda84))


### Bug Fixes

* add argument hint and scope section to test iterator prompt ([7f8c03a](https://github.com/ai-driven-dev/aidd-framework/commit/7f8c03aeab39c8d31a63fe0403aaea84f036567d))
* align memory paths, development flows, and phantom command references ([dc68610](https://github.com/ai-driven-dev/aidd-framework/commit/dc68610d5d8decc91c90eade055d2720eb37d4e8))
* clarify documentation rules and enhance categorization of learnings in learn.md ([bdaf1af](https://github.com/ai-driven-dev/aidd-framework/commit/bdaf1afd46d2a217f45427ec72c366ff483f4671))
* clarify mermaid node ID and label naming rules ([94f4611](https://github.com/ai-driven-dev/aidd-framework/commit/94f46112fd070e21c550e2e98b20516d92dc2034)), closes [#10](https://github.com/ai-driven-dev/aidd-framework/issues/10)
* correct formatting in CATALOG.md for better readability ([d13da18](https://github.com/ai-driven-dev/aidd-framework/commit/d13da18732f73371e27f0340c83a700d43af9e06))
* correct review_code template path from aidd/ to dev/ ([4118de9](https://github.com/ai-driven-dev/aidd-framework/commit/4118de932c308185da71f471ea5f78545fe93cd2)), closes [#11](https://github.com/ai-driven-dev/aidd-framework/issues/11)
* improve formatting of commit type table in README.md for better readability ([aac2695](https://github.com/ai-driven-dev/aidd-framework/commit/aac269588f345dffe90bf7ca2697eb8881ac6f76))
* refine clarity checklist instructions and remove redundant steps ([f23123f](https://github.com/ai-driven-dev/aidd-framework/commit/f23123f6e75d4ebf8523761ba4eba7c80db9f185))
* remove outdated steps from coding assertions and update reference path ([55c2538](https://github.com/ai-driven-dev/aidd-framework/commit/55c2538abfbe64ba3942665c83296e638c6a3f26))
* replace cross-repo relative links with full GitHub URLs ([a151ba5](https://github.com/ai-driven-dev/aidd-framework/commit/a151ba51914fc1b06022c1a3edc97710a146377d))
* update .gitignore to exclude all files in the dist directory ([6ef1499](https://github.com/ai-driven-dev/aidd-framework/commit/6ef149905596555c4ef079e3d0a6fa59e04b74c9))
* update argument hints in CATALOG.md for clarity ([353a5e5](https://github.com/ai-driven-dev/aidd-framework/commit/353a5e5b30e234efaffe09defb60336d74ce8818))
* update coding assertions to include additional examples for clarity ([34f765b](https://github.com/ai-driven-dev/aidd-framework/commit/34f765bb0f58ff47c60654291f8513522a99d4d3))
* update globs to include Markdown files for Mermaid diagram rules ([91727cf](https://github.com/ai-driven-dev/aidd-framework/commit/91727cf9920066241b8f18b925c915854290ca73))
* update links in documentation for clarity and consistency ([3b802c6](https://github.com/ai-driven-dev/aidd-framework/commit/3b802c67d322b1f720c1c0b16b971dface4cb6b3))
* update mermaid diagram labels for clarity in README ([1680d7e](https://github.com/ai-driven-dev/aidd-framework/commit/1680d7ed4e338ad97d28392283749de134673f2a))
* update npm_update function to install latest pnpm using corepack ([fa6e313](https://github.com/ai-driven-dev/aidd-framework/commit/fa6e313be70fcb58b64ae784e97541061d8f3bfe))
* update paths for GitHub Copilot instruction templates ([b19430e](https://github.com/ai-driven-dev/aidd-framework/commit/b19430e6b8895643b01803e146c5fb7384cdc42f))


### Documentation

* add aidd.sh script with aliases and utility functions for enhanced productivity ([7000eac](https://github.com/ai-driven-dev/aidd-framework/commit/7000eac7e22a1a11bb0cf4ea6c577bd6f9b34b34))
* add auto-accept command documentation and enhance VSCode settings ([2b6b37c](https://github.com/ai-driven-dev/aidd-framework/commit/2b6b37c54518ad7a4245c7a39a4e62cb53f399e1))
* add auto-accept command documentation and update CATALOG.md with framework content ([cb8ae2a](https://github.com/ai-driven-dev/aidd-framework/commit/cb8ae2adae98c4d3b6a938eac589a97026282898))
* add changelog and align versioning configuration ([9555e46](https://github.com/ai-driven-dev/aidd-framework/commit/9555e46f60e8272ad29eab8ecfe2a314dbaba520))
* add rules section to audit.md for codebase analysis ([bad8dc3](https://github.com/ai-driven-dev/aidd-framework/commit/bad8dc3d7dd81dcc95551ff5d4a26cd444f61f5b))
* add versioning and contribution guidelines ([a3d0c25](https://github.com/ai-driven-dev/aidd-framework/commit/a3d0c255e48db3358c48599f8480c86f25d1e6df))
* clarify assertion listing in assert.md and add new audit.md for codebase analysis ([fbcd4d3](https://github.com/ai-driven-dev/aidd-framework/commit/fbcd4d313f3e3fd53509cdca2cc29be59c3721a9))
* enhance behavior guidelines in AGENTS.md for clarity and effectiveness ([14623f4](https://github.com/ai-driven-dev/aidd-framework/commit/14623f453f6f0345f44da96e6811b3053839db6a))
* extract catalog, translate README and CONTRIBUTING to English ([e893bf0](https://github.com/ai-driven-dev/aidd-framework/commit/e893bf0a6aac75d19b7ac3a7d105f061224ac4a9))
* simplify file path patterns in ide-mapping files for consistency ([1d01ae7](https://github.com/ai-driven-dev/aidd-framework/commit/1d01ae72f10226c9cbe0491a726824db4c51804c))
* update command reference and enhance feature building workflows in README ([b70b529](https://github.com/ai-driven-dev/aidd-framework/commit/b70b529c7eb937bce1e047c1f8f5f828cf16d68f))
* update file path patterns in ide-mapping files for consistency ([dcae122](https://github.com/ai-driven-dev/aidd-framework/commit/dcae1221b5a0decd923ae332f9f0705f0673dbe5))
* update generate_rules documentation for clarity and detail ([a1493dd](https://github.com/ai-driven-dev/aidd-framework/commit/a1493ddfafb59543fc42b7f103ce935be76a0dad))
* update README to enhance clarity and structure ([62d1292](https://github.com/ai-driven-dev/aidd-framework/commit/62d1292d3956404045d204c81911a8bfb76a0511))


### Style

* reformat CATALOG.md table alignment ([2389e5f](https://github.com/ai-driven-dev/aidd-framework/commit/2389e5fdee6c2d871d81173239f1b251735fb835))


### Refactoring

* clarify correctness criteria and improve section headings in challenge documentation ([6958244](https://github.com/ai-driven-dev/aidd-framework/commit/695824430af7fbed2793f9794a33e8b578765670))
* codebase audit, remove PM ([9665604](https://github.com/ai-driven-dev/aidd-framework/commit/96656043f34f266db0c4bc079c381eb13baa1be6))
* consolidate templates into aidd_docs and rewrite README ([758a7ce](https://github.com/ai-driven-dev/aidd-framework/commit/758a7cea186192ca7eb624abb4b5b6d0d008495c))
* enhance clarity in user journey documentation by adding warnings and task instructions ([fc9688d](https://github.com/ai-driven-dev/aidd-framework/commit/fc9688d719e4f68fcc5671fd90e13d170acbf4d8))
* enhance implementation guidelines by adding a decisive rule and clarifying agent usage ([c55ba37](https://github.com/ai-driven-dev/aidd-framework/commit/c55ba37a312b124a459f3c1102a2f672a46bd220))
* enhance user journey visualization by updating diagram syntax and improving task planning steps ([354a985](https://github.com/ai-driven-dev/aidd-framework/commit/354a985d1997a31f3e7a89e8c84002cd98f64ce4))
* improve VCS guidelines formatting and enhance clarity in plan generation steps ([c4e8bfa](https://github.com/ai-driven-dev/aidd-framework/commit/c4e8bfadb260d8a5b063fe846acd66fe499e3298))
* move PM commands for approval ([ff6f7eb](https://github.com/ai-driven-dev/aidd-framework/commit/ff6f7ebec1ad533d7cbc45a583fc58ee1befa0ab))
* move sync-dist build into framework and add per-tool tarballs to release ([9949658](https://github.com/ai-driven-dev/aidd-framework/commit/994965874ae7575d1394b71a2d494d90fb50666d))
* outsource PM, change folder structure ([856fe61](https://github.com/ai-driven-dev/aidd-framework/commit/856fe61407e0b20a913db69c575e1b031fe8f73a))
* standardize naming convention for auto-accept command and enhance catalog documentation ([99c515f](https://github.com/ai-driven-dev/aidd-framework/commit/99c515f180e8cf786704f57e7f5382faee92d824))
* update descriptions and streamline instruction steps for Alexia and Auto-Implement agents ([a50eaf8](https://github.com/ai-driven-dev/aidd-framework/commit/a50eaf8ee806dd26ca3855ea01ec2b2302ac5efc))
* update descriptions and streamline user story templates ([4266090](https://github.com/ai-driven-dev/aidd-framework/commit/4266090f29a6ba19444fa110e2051c837e5d5499))
* update documentation for Kent and Martin agents, enhance coding assertions, and improve implementation process clarity ([ba0ed37](https://github.com/ai-driven-dev/aidd-framework/commit/ba0ed379794d0825c134d97659dbef354216044b))
* update formatting and remove outdated sections in documentation ([3ed7064](https://github.com/ai-driven-dev/aidd-framework/commit/3ed7064848539b2e9f8dd5eb76731d3021682399))
* update mcp.json structure and enhance config format validation in tests ([e5d8d41](https://github.com/ai-driven-dev/aidd-framework/commit/e5d8d416c727a74210939553939d375a71b6dffe))
* update paths in VSCode settings for instruction templates ([5772d76](https://github.com/ai-driven-dev/aidd-framework/commit/5772d76a7115046a1438f0e52886277af0d50b2c))


### Build

* exclude dev files from tarball and add version.txt ([e25d77d](https://github.com/ai-driven-dev/aidd-framework/commit/e25d77da254ac982c9c27fa25cd33203391e8f61))


### Miscellaneous

* add node_modules/ and .specstory/ to .gitignore ([bb77d3a](https://github.com/ai-driven-dev/aidd-framework/commit/bb77d3a12b5b06e158a85bc47b61c4a8cfd80848))
* **main:** release 3.0.1 ([3fb425b](https://github.com/ai-driven-dev/aidd-framework/commit/3fb425b7d65a86bbce6de4fb47796289834f554d))
* **main:** release 3.0.1 ([aadb50f](https://github.com/ai-driven-dev/aidd-framework/commit/aadb50ffbf86e1f95f9c3882c5b207aa2ba92209))
* **main:** release 3.1.0 ([f2db6d0](https://github.com/ai-driven-dev/aidd-framework/commit/f2db6d00eba878989ade74736d118af469a4bfe9))
* **main:** release 3.1.0 ([64d9c80](https://github.com/ai-driven-dev/aidd-framework/commit/64d9c80d078bdddff6e865f3234da4270a6c7a35))
* **main:** release 3.2.0 ([98e6ed1](https://github.com/ai-driven-dev/aidd-framework/commit/98e6ed1a52c6a7abbca2092f14b754aa8c40eab4))
* **main:** release 3.2.0 ([a5110f6](https://github.com/ai-driven-dev/aidd-framework/commit/a5110f6229d80744f60f3abce2f78f60160b398e))
* **main:** release 3.2.1 ([6e468ef](https://github.com/ai-driven-dev/aidd-framework/commit/6e468efbae135f2375faa17e7636e189748d7c28))
* **main:** release 3.2.1 ([3ae77ab](https://github.com/ai-driven-dev/aidd-framework/commit/3ae77ab62ea650e092bfb023632f1b1d069fa9d6))
* **main:** release 3.2.2 ([22b10af](https://github.com/ai-driven-dev/aidd-framework/commit/22b10af5ca2d6db56ed2043d90fb4a6e99fd260c))
* **main:** release 3.2.2 ([6b411b2](https://github.com/ai-driven-dev/aidd-framework/commit/6b411b20658cd01d7c87eff1b00a31b08fd81643))
* **main:** release 3.2.3 ([2ec6412](https://github.com/ai-driven-dev/aidd-framework/commit/2ec64128273a55694a2f5ef282b17d33a77d199a))
* **main:** release 3.2.3 ([d624b9f](https://github.com/ai-driven-dev/aidd-framework/commit/d624b9f8332c1565cf639fce9940275b1bfe96bc))
* remove config.yml ([e6aaa47](https://github.com/ai-driven-dev/aidd-framework/commit/e6aaa47a7f6df1fe35f3f4cc5c02b7f5c65b5c29))


### CI

* add Release Please workflows and configuration ([56a96eb](https://github.com/ai-driven-dev/aidd-framework/commit/56a96eb14eb4329b1423a77fd2596a2d0c1231ab))
* add statuses write permission to lint-pr workflow ([4ad953f](https://github.com/ai-driven-dev/aidd-framework/commit/4ad953fbf4dd455c3a8d2999ff5fc956d6766d1a))

## [3.2.3](https://github.com/ai-driven-dev/aidd-framework/compare/v3.2.2...v3.2.3) (2026-03-04)


### Bug Fixes

* clarify mermaid node ID and label naming rules ([94f4611](https://github.com/ai-driven-dev/aidd-framework/commit/94f46112fd070e21c550e2e98b20516d92dc2034)), closes [#10](https://github.com/ai-driven-dev/aidd-framework/issues/10)
* correct review_code template path from aidd/ to dev/ ([4118de9](https://github.com/ai-driven-dev/aidd-framework/commit/4118de932c308185da71f471ea5f78545fe93cd2)), closes [#11](https://github.com/ai-driven-dev/aidd-framework/issues/11)
* update globs to include Markdown files for Mermaid diagram rules ([91727cf](https://github.com/ai-driven-dev/aidd-framework/commit/91727cf9920066241b8f18b925c915854290ca73))


### CI

* add statuses write permission to lint-pr workflow ([4ad953f](https://github.com/ai-driven-dev/aidd-framework/commit/4ad953fbf4dd455c3a8d2999ff5fc956d6766d1a))

## [3.2.2](https://github.com/ai-driven-dev/aidd-framework/compare/v3.2.1...v3.2.2) (2026-02-27)


### Bug Fixes

* update npm_update function to install latest pnpm using corepack ([fa6e313](https://github.com/ai-driven-dev/aidd-framework/commit/fa6e313be70fcb58b64ae784e97541061d8f3bfe))

## [3.2.1](https://github.com/ai-driven-dev/aidd-framework/compare/v3.2.0...v3.2.1) (2026-02-23)


### Bug Fixes

* add argument hint and scope section to test iterator prompt ([7f8c03a](https://github.com/ai-driven-dev/aidd-framework/commit/7f8c03aeab39c8d31a63fe0403aaea84f036567d))
* correct formatting in CATALOG.md for better readability ([d13da18](https://github.com/ai-driven-dev/aidd-framework/commit/d13da18732f73371e27f0340c83a700d43af9e06))
* improve formatting of commit type table in README.md for better readability ([aac2695](https://github.com/ai-driven-dev/aidd-framework/commit/aac269588f345dffe90bf7ca2697eb8881ac6f76))
* refine clarity checklist instructions and remove redundant steps ([f23123f](https://github.com/ai-driven-dev/aidd-framework/commit/f23123f6e75d4ebf8523761ba4eba7c80db9f185))
* remove outdated steps from coding assertions and update reference path ([55c2538](https://github.com/ai-driven-dev/aidd-framework/commit/55c2538abfbe64ba3942665c83296e638c6a3f26))
* update argument hints in CATALOG.md for clarity ([353a5e5](https://github.com/ai-driven-dev/aidd-framework/commit/353a5e5b30e234efaffe09defb60336d74ce8818))
* update coding assertions to include additional examples for clarity ([34f765b](https://github.com/ai-driven-dev/aidd-framework/commit/34f765bb0f58ff47c60654291f8513522a99d4d3))
* update links in documentation for clarity and consistency ([3b802c6](https://github.com/ai-driven-dev/aidd-framework/commit/3b802c67d322b1f720c1c0b16b971dface4cb6b3))


### Refactoring

* outsource PM, change folder structure ([856fe61](https://github.com/ai-driven-dev/aidd-framework/commit/856fe61407e0b20a913db69c575e1b031fe8f73a))

## [3.2.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.1.0...v3.2.0) (2026-02-20)


### Features

* add ASCII user journey diagram for improved understanding and validation in implementation plans ([a2587f0](https://github.com/ai-driven-dev/aidd-framework/commit/a2587f0d8ed4f006a806c1afc9e9e6682b55e35c))
* add assert_architecture command to verify code conformity with architecture standards ([5e02c67](https://github.com/ai-driven-dev/aidd-framework/commit/5e02c670699705924d21470f605e0b58280dfea9))
* add confidence level prompt to challenge output and update plan rules for configuration preparation ([6c5c8e1](https://github.com/ai-driven-dev/aidd-framework/commit/6c5c8e1bdb90d2e80f7e0ae43ecd827513f952b5))
* add generate_architecture command and establish command structure standards ([52cc952](https://github.com/ai-driven-dev/aidd-framework/commit/52cc9524817851c02c6d355848961188d1cdc6a3))
* add guideline to split phases based on responsibilities in plan generation ([09403fe](https://github.com/ai-driven-dev/aidd-framework/commit/09403febdf91ea49a4eacd9ba1594e0e192afa09))
* add JSONC comment stripping and .vscode/settings.json generation for Claude tool ([1ddac51](https://github.com/ai-driven-dev/aidd-framework/commit/1ddac51f1a9204e0f4a7f0896a5f0802970d2851))
* add lefthook child-to-parent delegation + auto-install ([6527e6d](https://github.com/ai-driven-dev/aidd-framework/commit/6527e6d4494fd6c484be219815472014a9a97ccc))
* enhance documentation for challenge skill and add mermaid generation rules ([2e3ab24](https://github.com/ai-driven-dev/aidd-framework/commit/2e3ab24f91e11509e70d77a8a541e9331946e922))
* enhance run_projection documentation to emphasize file architecture relevance ([f051c03](https://github.com/ai-driven-dev/aidd-framework/commit/f051c03f25d7ddc083cd437a19a424b31495e852))
* remove improve_prompt and isolate commands from the framework catalog ([b969e79](https://github.com/ai-driven-dev/aidd-framework/commit/b969e79dc2542fbb643fdf9789b9b227ba083347))


### Bug Fixes

* update mermaid diagram labels for clarity in README ([1680d7e](https://github.com/ai-driven-dev/aidd-framework/commit/1680d7ed4e338ad97d28392283749de134673f2a))


### Documentation

* add rules section to audit.md for codebase analysis ([bad8dc3](https://github.com/ai-driven-dev/aidd-framework/commit/bad8dc3d7dd81dcc95551ff5d4a26cd444f61f5b))


### Refactoring

* clarify correctness criteria and improve section headings in challenge documentation ([6958244](https://github.com/ai-driven-dev/aidd-framework/commit/695824430af7fbed2793f9794a33e8b578765670))
* enhance clarity in user journey documentation by adding warnings and task instructions ([fc9688d](https://github.com/ai-driven-dev/aidd-framework/commit/fc9688d719e4f68fcc5671fd90e13d170acbf4d8))
* enhance implementation guidelines by adding a decisive rule and clarifying agent usage ([c55ba37](https://github.com/ai-driven-dev/aidd-framework/commit/c55ba37a312b124a459f3c1102a2f672a46bd220))
* enhance user journey visualization by updating diagram syntax and improving task planning steps ([354a985](https://github.com/ai-driven-dev/aidd-framework/commit/354a985d1997a31f3e7a89e8c84002cd98f64ce4))
* improve VCS guidelines formatting and enhance clarity in plan generation steps ([c4e8bfa](https://github.com/ai-driven-dev/aidd-framework/commit/c4e8bfadb260d8a5b063fe846acd66fe499e3298))
* standardize naming convention for auto-accept command and enhance catalog documentation ([99c515f](https://github.com/ai-driven-dev/aidd-framework/commit/99c515f180e8cf786704f57e7f5382faee92d824))
* update descriptions and streamline instruction steps for Alexia and Auto-Implement agents ([a50eaf8](https://github.com/ai-driven-dev/aidd-framework/commit/a50eaf8ee806dd26ca3855ea01ec2b2302ac5efc))
* update documentation for Kent and Martin agents, enhance coding assertions, and improve implementation process clarity ([ba0ed37](https://github.com/ai-driven-dev/aidd-framework/commit/ba0ed379794d0825c134d97659dbef354216044b))
* update mcp.json structure and enhance config format validation in tests ([e5d8d41](https://github.com/ai-driven-dev/aidd-framework/commit/e5d8d416c727a74210939553939d375a71b6dffe))
* update paths in VSCode settings for instruction templates ([5772d76](https://github.com/ai-driven-dev/aidd-framework/commit/5772d76a7115046a1438f0e52886277af0d50b2c))


### Miscellaneous

* add node_modules/ and .specstory/ to .gitignore ([bb77d3a](https://github.com/ai-driven-dev/aidd-framework/commit/bb77d3a12b5b06e158a85bc47b61c4a8cfd80848))

## [3.1.0](https://github.com/ai-driven-dev/aidd-framework/compare/v3.0.1...v3.1.0) (2026-02-17)


### Features

* add scaffoldEmptyRuleCategories and brand prefix for commands ([3cc6dc4](https://github.com/ai-driven-dev/aidd-framework/commit/3cc6dc4a928888e47e0cfebf054f960e9bc19415))


### Documentation

* add aidd.sh script with aliases and utility functions for enhanced productivity ([7000eac](https://github.com/ai-driven-dev/aidd-framework/commit/7000eac7e22a1a11bb0cf4ea6c577bd6f9b34b34))
* add auto-accept command documentation and enhance VSCode settings ([2b6b37c](https://github.com/ai-driven-dev/aidd-framework/commit/2b6b37c54518ad7a4245c7a39a4e62cb53f399e1))
* add auto-accept command documentation and update CATALOG.md with framework content ([cb8ae2a](https://github.com/ai-driven-dev/aidd-framework/commit/cb8ae2adae98c4d3b6a938eac589a97026282898))
* clarify assertion listing in assert.md and add new audit.md for codebase analysis ([fbcd4d3](https://github.com/ai-driven-dev/aidd-framework/commit/fbcd4d313f3e3fd53509cdca2cc29be59c3721a9))
* enhance behavior guidelines in AGENTS.md for clarity and effectiveness ([14623f4](https://github.com/ai-driven-dev/aidd-framework/commit/14623f453f6f0345f44da96e6811b3053839db6a))
* simplify file path patterns in ide-mapping files for consistency ([1d01ae7](https://github.com/ai-driven-dev/aidd-framework/commit/1d01ae72f10226c9cbe0491a726824db4c51804c))
* update command reference and enhance feature building workflows in README ([b70b529](https://github.com/ai-driven-dev/aidd-framework/commit/b70b529c7eb937bce1e047c1f8f5f828cf16d68f))
* update file path patterns in ide-mapping files for consistency ([dcae122](https://github.com/ai-driven-dev/aidd-framework/commit/dcae1221b5a0decd923ae332f9f0705f0673dbe5))
* update generate_rules documentation for clarity and detail ([a1493dd](https://github.com/ai-driven-dev/aidd-framework/commit/a1493ddfafb59543fc42b7f103ce935be76a0dad))
* update README to enhance clarity and structure ([62d1292](https://github.com/ai-driven-dev/aidd-framework/commit/62d1292d3956404045d204c81911a8bfb76a0511))


### Refactoring

* codebase audit, remove PM ([9665604](https://github.com/ai-driven-dev/aidd-framework/commit/96656043f34f266db0c4bc079c381eb13baa1be6))
* consolidate templates into aidd_docs and rewrite README ([758a7ce](https://github.com/ai-driven-dev/aidd-framework/commit/758a7cea186192ca7eb624abb4b5b6d0d008495c))
* move sync-dist build into framework and add per-tool tarballs to release ([9949658](https://github.com/ai-driven-dev/aidd-framework/commit/994965874ae7575d1394b71a2d494d90fb50666d))

## [3.0.1](https://github.com/ai-driven-dev/aidd-framework/compare/v3.0.0...v3.0.1) (2026-02-12)


### Documentation

* add changelog and align versioning configuration ([9555e46](https://github.com/ai-driven-dev/aidd-framework/commit/9555e46f60e8272ad29eab8ecfe2a314dbaba520))
* add versioning and contribution guidelines ([a3d0c25](https://github.com/ai-driven-dev/aidd-framework/commit/a3d0c255e48db3358c48599f8480c86f25d1e6df))


### Miscellaneous

* remove config.yml ([e6aaa47](https://github.com/ai-driven-dev/aidd-framework/commit/e6aaa47a7f6df1fe35f3f4cc5c02b7f5c65b5c29))

## [3.0.0](https://github.com/ai-driven-dev/aidd-framework/releases/tag/v3.0.0) (2026-02-12)

Initial release of the AIDD Framework as a standalone repository with automated versioning.

### Features

* initial migration of AIDD Framework from monorepo ([1785eed](https://github.com/ai-driven-dev/aidd-framework/commit/1785eed37b34339aad0fb684e1994485e4c81406))
* add settings.json to configure Gitignore behavior ([180d0e9](https://github.com/ai-driven-dev/aidd-framework/commit/180d0e9fc87420c54cb2d9aa7d2bad7f77e2b349))
* update agent models to include new configurations ([6dcbc38](https://github.com/ai-driven-dev/aidd-framework/commit/6dcbc38eb19b3c43181652d196a58f4eac6eda84))
* add permissions configuration to settings.json for enhanced security ([0ced082](https://github.com/ai-driven-dev/aidd-framework/commit/0ced08248ba5aee4efa415e732453c05a3a92787))
* clarify header title definition in Mermaid generation rules ([3c2521c](https://github.com/ai-driven-dev/aidd-framework/commit/3c2521c61a24804a30fa97becfcd224064337871))
* remove optional context section from isolate command documentation ([ba61286](https://github.com/ai-driven-dev/aidd-framework/commit/ba61286e43bb56124c18b2e99e9c9af17417257d))
* add INSTALL_README.md template for per-tool dist ([0395c0e](https://github.com/ai-driven-dev/aidd-framework/commit/0395c0efb73de1dfa340e77de6ea5620f4894ac3))
* add .gitignore to exclude tool-specific directories ([fb7fc1c](https://github.com/ai-driven-dev/aidd-framework/commit/fb7fc1c46329c076bcea7c6e86731f1731fbc6b0))
* redraw aidd_docs/ ([494a0d3](https://github.com/ai-driven-dev/aidd-framework/commit/494a0d335921cec05d422e0b29a5d5edfee46dc6))
* new CATALOG and prompt templates ([a12e196](https://github.com/ai-driven-dev/aidd-framework/commit/a12e196e67637d6735350f595835c8cf05e16b59))
* add prompt template and update CATALOG reference ([ac57bf9](https://github.com/ai-driven-dev/aidd-framework/commit/ac57bf9af81feab4ce8fbe49fbb71ba81c8b20e5))
* revert prompts template and update CATALOG structure ([e2afdff](https://github.com/ai-driven-dev/aidd-framework/commit/e2afdfff32a63bb48f82c514a9a37d27e0d3f55f))
* add ticket_info command and remove jira_info command ([fb3e494](https://github.com/ai-driven-dev/aidd-framework/commit/fb3e494ed1d85780b1a647487af2ebd41c6bb604))

### Bug Fixes

* replace cross-repo relative links with full GitHub URLs ([a151ba5](https://github.com/ai-driven-dev/aidd-framework/commit/a151ba51914fc1b06022c1a3edc97710a146377d))
* align memory paths, development flows, and phantom command references ([dc68610](https://github.com/ai-driven-dev/aidd-framework/commit/dc68610d5d8decc91c90eade055d2720eb37d4e8))
* update paths for GitHub Copilot instruction templates ([b19430e](https://github.com/ai-driven-dev/aidd-framework/commit/b19430e6b8895643b01803e146c5fb7384cdc42f))
* update .gitignore to exclude all files in the dist directory ([6ef1499](https://github.com/ai-driven-dev/aidd-framework/commit/6ef149905596555c4ef079e3d0a6fa59e04b74c9))

### Documentation

* extract catalog, translate README and CONTRIBUTING to English ([e893bf0](https://github.com/ai-driven-dev/aidd-framework/commit/e893bf0a6aac75d19b7ac3a7d105f061224ac4a9))
* add versioning and contribution guidelines ([a3d0c25](https://github.com/ai-driven-dev/aidd-framework/commit/a3d0c2556e53e3da2e2f1b21e63e4efd8e1e90ee))

### Style

* reformat CATALOG.md table alignment ([2389e5f](https://github.com/ai-driven-dev/aidd-framework/commit/2389e5fdee6c2d871d81173239f1b251735fb835))

### Refactoring

* update descriptions and streamline user story templates ([4266090](https://github.com/ai-driven-dev/aidd-framework/commit/4266090f29a6ba19444fa110e2051c837e5d5499))
* update formatting and remove outdated sections in documentation ([3ed7064](https://github.com/ai-driven-dev/aidd-framework/commit/3ed7064848539b2e9f8dd5eb76731d3021682399))

### Breaking Changes

* move PM commands for approval ([ff6f7eb](https://github.com/ai-driven-dev/aidd-framework/commit/ff6f7ebec1ad533d7cbc45a583fc58ee1befa0ab))
