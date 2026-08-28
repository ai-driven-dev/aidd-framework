# Changelog

## [5.2.1](https://github.com/ai-driven-dev/framework/compare/cli-v5.2.0...cli-v5.2.1) (2026-08-14)


### Bug Fixes

* **cli:** transform codex marketplace skills ([#571](https://github.com/ai-driven-dev/framework/issues/571)) ([734c9c3](https://github.com/ai-driven-dev/framework/commit/734c9c39cad9b6f4f9ea181e320ff360d870741f))


### Miscellaneous

* **deps-dev:** bump @biomejs/biome from 2.5.6 to 2.5.7 in /cli ([#616](https://github.com/ai-driven-dev/framework/issues/616)) ([287a161](https://github.com/ai-driven-dev/framework/commit/287a161c443adbca10fb99c6d5224a1fbe705ed7))
* **deps-dev:** bump @types/node from 26.1.2 to 26.2.0 in /cli ([#615](https://github.com/ai-driven-dev/framework/issues/615)) ([89fd4ea](https://github.com/ai-driven-dev/framework/commit/89fd4eac5113aa62b9075a91b33e51c386ee4dc3))
* **deps-dev:** bump fast-check from 4.7.0 to 4.9.0 in /cli ([#607](https://github.com/ai-driven-dev/framework/issues/607)) ([2cd5aa6](https://github.com/ai-driven-dev/framework/commit/2cd5aa676a070def99e73cefc3007290303a8591))
* **deps-dev:** bump jscpd from 5.0.7 to 5.0.14 in /cli ([#606](https://github.com/ai-driven-dev/framework/issues/606)) ([74c15c2](https://github.com/ai-driven-dev/framework/commit/74c15c2d22067d1065de9bf4991a781394d938cf))
* **deps-dev:** bump knip from 6.31.0 to 6.32.0 in /cli ([#613](https://github.com/ai-driven-dev/framework/issues/613)) ([6e1f6aa](https://github.com/ai-driven-dev/framework/commit/6e1f6aa3426a94cf2d16a47963b9c0b1453bfbc4))
* **deps:** bump smol-toml from 1.6.1 to 1.7.1 in /cli ([#614](https://github.com/ai-driven-dev/framework/issues/614)) ([b766a31](https://github.com/ai-driven-dev/framework/commit/b766a3163d4793c36bf22737a6572ead1726c5b8))

## [5.2.0](https://github.com/ai-driven-dev/framework/compare/cli-v5.1.6...cli-v5.2.0) (2026-08-06)


### Features

* **aidd-pm:** keep a typed product backlog coherent whoever writes to it ([#582](https://github.com/ai-driven-dev/framework/issues/582)) ([fe0eebc](https://github.com/ai-driven-dev/framework/commit/fe0eebc5cf142e6668859f83dfe7ae4a38097435))
* **kanban:** mount the kanban viewer on aidd as a hidden command ([#573](https://github.com/ai-driven-dev/framework/issues/573)) ([0e73737](https://github.com/ai-driven-dev/framework/commit/0e737371ff9c64e152d40575c29ffc985d31e614))


### Bug Fixes

* **ci:** unbreak the framework-local checks after the kanban move ([#574](https://github.com/ai-driven-dev/framework/issues/574)) ([2f69050](https://github.com/ai-driven-dev/framework/commit/2f69050ce7df1059ff0fc337d6e171174a5f46b1))


### Miscellaneous

* **deps-dev:** bump @biomejs/biome from 2.4.7 to 2.5.6 in /cli ([#577](https://github.com/ai-driven-dev/framework/issues/577)) ([2f31414](https://github.com/ai-driven-dev/framework/commit/2f31414126465138bd62e280be8d909371ae1578))
* **deps-dev:** bump knip from 6.16.1 to 6.31.0 in /cli ([#578](https://github.com/ai-driven-dev/framework/issues/578)) ([c392ccf](https://github.com/ai-driven-dev/framework/commit/c392ccfe34a28a392270ab322e13c967d7f86e47))
* **deps:** bump react and @types/react in /cli ([#576](https://github.com/ai-driven-dev/framework/issues/576)) ([cc3659a](https://github.com/ai-driven-dev/framework/commit/cc3659a527cf0d50dbd7b07f703999b3ef13da93))

## [5.1.6](https://github.com/ai-driven-dev/framework/compare/cli-v5.1.5...cli-v5.1.6) (2026-07-31)


### Bug Fixes

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


### Refactoring

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

## [5.1.5](https://github.com/ai-driven-dev/framework/compare/cli-v5.1.4...cli-v5.1.5) (2026-07-22)


### Bug Fixes

* **docs:** resolve real broken markdown links, drop temporary link-check excludes ([#500](https://github.com/ai-driven-dev/framework/issues/500)) ([c6103e6](https://github.com/ai-driven-dev/framework/commit/c6103e636ede5c66667fd0e6ebe9eccee87a6e3d))

## [5.1.4](https://github.com/ai-driven-dev/framework/compare/cli-v5.1.3...cli-v5.1.4) (2026-07-22)


### Bug Fixes

* **cli:** add license and keywords for the npm package page ([691c1c3](https://github.com/ai-driven-dev/framework/commit/691c1c3d30f572e9f13a83f9997d9780b2205914))
* **cli:** migrate aidd-cli into framework as cli/, full history preserved ([daeef56](https://github.com/ai-driven-dev/framework/commit/daeef56aa3002142a1f2fbed048769e959ab60fe))
* **cli:** repoint self-references from aidd-cli to framework ([601c30c](https://github.com/ai-driven-dev/framework/commit/601c30c84d2adb04e3c6327a1a7778a894db3b33))
* **cli:** restore correct version after release-please regression ([#488](https://github.com/ai-driven-dev/framework/issues/488)) ([047bcb2](https://github.com/ai-driven-dev/framework/commit/047bcb29e5729d13dd7d27b0921ecc3cbb7eb9d3))
* **cli:** restore correct version again after second regression, re-anchor for release-please ([#493](https://github.com/ai-driven-dev/framework/issues/493)) ([22171ed](https://github.com/ai-driven-dev/framework/commit/22171ed8997a28fb695168353b0541401e3272b7))


### Miscellaneous

* release main ([#485](https://github.com/ai-driven-dev/framework/issues/485)) ([be7195b](https://github.com/ai-driven-dev/framework/commit/be7195b0978d729a1de39826d771511d15f03331))
* release main ([#489](https://github.com/ai-driven-dev/framework/issues/489)) ([c84fc3d](https://github.com/ai-driven-dev/framework/commit/c84fc3d8fee6e93cee4ea0c5d0d7fe68eac990ea))

## [5.1.3](https://github.com/ai-driven-dev/aidd-cli/compare/v5.1.2...v5.1.3) (2026-07-17)


### Bug Fixes

* **self-update:** resolve version from npm registry, not private GitHub repo ([#316](https://github.com/ai-driven-dev/aidd-cli/issues/316)) ([34fc0a1](https://github.com/ai-driven-dev/aidd-cli/commit/34fc0a123a10bf31325d5886aa7a507847e84431))

## [5.1.2](https://github.com/ai-driven-dev/aidd-cli/compare/v5.1.1...v5.1.2) (2026-07-15)


### Bug Fixes

* **opencode:** emit opencode.json unconditionally in flat build ([#313](https://github.com/ai-driven-dev/aidd-cli/issues/313)) ([66e2e4c](https://github.com/ai-driven-dev/aidd-cli/commit/66e2e4c9ba007f527079b4116473f4352bbac6f4))

## [5.1.1](https://github.com/ai-driven-dev/aidd-cli/compare/v5.1.0...v5.1.1) (2026-07-05)


### Bug Fixes

* **codex:** emit official marketplace dist for `codex plugin marketplace add` ([#311](https://github.com/ai-driven-dev/aidd-cli/issues/311)) ([6f60351](https://github.com/ai-driven-dev/aidd-cli/commit/6f60351942687fe9d948083db48708ccbb9ffb84))


### Documentation

* restructure project docs and memory bank ([c46f87b](https://github.com/ai-driven-dev/aidd-cli/commit/c46f87b4a48476226cf3ad8ada57eb3b51f0f31e))

## [5.1.0](https://github.com/ai-driven-dev/aidd-cli/compare/v5.0.2...v5.1.0) (2026-07-01)


### Features

* **copilot:** activate plugins via native copilot CLI ([#306](https://github.com/ai-driven-dev/aidd-cli/issues/306)) ([e0de6d7](https://github.com/ai-driven-dev/aidd-cli/commit/e0de6d76d23a9c15ec241ab1a61fdf08e861943c))
* **install:** add per-target built-marketplace cache foundation ([de21e21](https://github.com/ai-driven-dev/aidd-cli/commit/de21e21634cc1cf4fb2c3faf8775d474b3552d24))
* **install:** cursor materializes from the built tree ([da0e852](https://github.com/ai-driven-dev/aidd-cli/commit/da0e8522ac3d7c8934fc3f34135ec496a67fba8d))
* **install:** delete sync feature; finalize build/install parity ([2995f52](https://github.com/ai-driven-dev/aidd-cli/commit/2995f52a3ea19267d96ac3862832147b4321c2c3))
* **install:** native tools (codex/copilot) register the built tree ([e9ef8a4](https://github.com/ai-driven-dev/aidd-cli/commit/e9ef8a451512b4a64ff8aa82bee628fc92935b29))
* **install:** opencode materializes from the flat built tree ([83c500f](https://github.com/ai-driven-dev/aidd-cli/commit/83c500f873a6189b61f38e08eaf823ae9f8ad37f))
* **install:** point settings-file tools at the built tree ([ab2c770](https://github.com/ai-driven-dev/aidd-cli/commit/ab2c770825794c20c344a0d4b4b5db8090fc8b53))


### Bug Fixes

* **cli:** [#286](https://github.com/ai-driven-dev/aidd-cli/issues/286) conflict guard + working --force on update commands ([#299](https://github.com/ai-driven-dev/aidd-cli/issues/299)) ([109d08a](https://github.com/ai-driven-dev/aidd-cli/commit/109d08a4a90c63609c286054ae4759c57ac60fc7))
* **codex:** enable plugins via native codex CLI so skills are discovered ([#302](https://github.com/ai-driven-dev/aidd-cli/issues/302)) ([3d9dcd5](https://github.com/ai-driven-dev/aidd-cli/commit/3d9dcd5564fa5c9ce0b904a589a26cd2e9db3aa0))
* **install:** restore re-materializes built tree for cursor/opencode ([162888f](https://github.com/ai-driven-dev/aidd-cli/commit/162888fe311d182773161d8597b62f06d40863f2))
* **install:** update re-materializes built tree for cursor/opencode ([6e7dc11](https://github.com/ai-driven-dev/aidd-cli/commit/6e7dc11b0be61d23cea3cd6079f0855a690478ea))


### Documentation

* **cli:** drop sync references from README and smoke surface ([77a67c7](https://github.com/ai-driven-dev/aidd-cli/commit/77a67c7330fb6e3eebbeae036363a72ea3fe7141))

## [5.0.2](https://github.com/ai-driven-dev/aidd-cli/compare/v5.0.1...v5.0.2) (2026-06-19)


### Bug Fixes

* **plugin:** read version from plugin.json when marketplace omits it ([#297](https://github.com/ai-driven-dev/aidd-cli/issues/297)) ([4af591e](https://github.com/ai-driven-dev/aidd-cli/commit/4af591eec914278c529d83e88126b180f4d6ba0f))

## [5.0.1](https://github.com/ai-driven-dev/aidd-cli/compare/v5.0.0...v5.0.1) (2026-06-19)


### Bug Fixes

* **docs:** remove duplicate memory references in AGENTS.md and CLAUDE.md ([a159f4f](https://github.com/ai-driven-dev/aidd-cli/commit/a159f4f14e965473ccbc0d27f69bf4b7cfd71c9f))
* **framework:** emit Claude plugin agents as a file list, not a directory ([#293](https://github.com/ai-driven-dev/aidd-cli/issues/293)) ([0c8fdc3](https://github.com/ai-driven-dev/aidd-cli/commit/0c8fdc36c2a155f35d46096d976627414cb12b93))
* **opencode:** tolerate JSONC in user-owned opencode.json during install ([#296](https://github.com/ai-driven-dev/aidd-cli/issues/296)) ([13a15fe](https://github.com/ai-driven-dev/aidd-cli/commit/13a15fef224bd697ba0bc1bf3aa93d1e54d68178))


### Documentation

* **cli:** refresh project memory + add cli/auth capability files ([25a1143](https://github.com/ai-driven-dev/aidd-cli/commit/25a11439b8dbc7f0f5cd984bf2aaf835c010ddc7))

## [5.0.0](https://github.com/ai-driven-dev/aidd-cli/compare/v4.6.1...v5.0.0) (2026-06-17)


### ⚠ BREAKING CHANGES

* **cli:** `aidd migrate` is removed. Projects on pre-v6 manifests no longer need it — the manifest auto-upgrades the next time any command loads it.

### Bug Fixes

* **cli:** actionable malformed-catalog error + doctor silent-exit + full-matrix smoke ([7dd9aac](https://github.com/ai-driven-dev/aidd-cli/commit/7dd9aacc688ba1f792e00c07d209b803350ae3ba))
* **cli:** align docs with code, remove dead --force flags ([#287](https://github.com/ai-driven-dev/aidd-cli/issues/287)) ([60ab985](https://github.com/ai-driven-dev/aidd-cli/commit/60ab98568b8024772732ae416aefd25b1891d493))
* **cli:** remediate June 2026 6-pillar audit + harden dead update-check ([#289](https://github.com/ai-driven-dev/aidd-cli/issues/289)) ([305fe7e](https://github.com/ai-driven-dev/aidd-cli/commit/305fe7ef5eebed82c9d33049f230054a3cb69e8c))


### Documentation

* **cli:** fix AGENTS.md memory refs to dash filenames + add command-surface rework plan ([81249b4](https://github.com/ai-driven-dev/aidd-cli/commit/81249b4121d2ef83a4d3215825e5e7bc2212cccb))


### Refactoring

* **cli:** remove migrate command; manifests auto-upgrade on load ([#291](https://github.com/ai-driven-dev/aidd-cli/issues/291)) ([5a1d5d5](https://github.com/ai-driven-dev/aidd-cli/commit/5a1d5d5f51b403a10ebf511dd374c166d6f86af0))

## [4.6.1](https://github.com/ai-driven-dev/aidd-cli/compare/v4.6.0...v4.6.1) (2026-06-04)


### Documentation

* **framework:** align framework build docs with 5-target/dual-mode reality ([#284](https://github.com/ai-driven-dev/aidd-cli/issues/284)) ([486a2d2](https://github.com/ai-driven-dev/aidd-cli/commit/486a2d24c9f35e01e976940a64c24fa4ae6e0d2c))

## [4.6.0](https://github.com/ai-driven-dev/aidd-cli/compare/v4.5.0...v4.6.0) (2026-06-04)


### Features

* **framework:** unified ToolBuildContract + multi-target build, both modes (marketplace + flat, all 5 tools) ([#279](https://github.com/ai-driven-dev/aidd-cli/issues/279)) ([d43cf63](https://github.com/ai-driven-dev/aidd-cli/commit/d43cf63c534ecd2560f9ab126e32fa1af87511eb))
* **skills:** add smoke-test action to test skill (/tmp isolation) ([f0eb440](https://github.com/ai-driven-dev/aidd-cli/commit/f0eb4401820847b746a90eb7801339cef7119a28))


### Bug Fixes

* **framework:** flat-mode discovery + per-tool hooks + copilot OpenPlugin + codex skills (5 tools live-validated) ([#281](https://github.com/ai-driven-dev/aidd-cli/issues/281)) ([5622d47](https://github.com/ai-driven-dev/aidd-cli/commit/5622d47c9b1d2143cccdc2a6028aa4f6c5ac5d95))


### Documentation

* **memory:** capture smoke-in-tmp + golden machine-independence conventions ([#277](https://github.com/ai-driven-dev/aidd-cli/issues/277)) ([4e4f1ee](https://github.com/ai-driven-dev/aidd-cli/commit/4e4f1ee0f4f4ba680274be3cbdd0b04cbbc2e3b6))


### Refactoring

* **knowledge:** dev-skills architecture + skill-guided code remediation ([4f53ea9](https://github.com/ai-driven-dev/aidd-cli/commit/4f53ea99eb9ed7b43c0098efed37eff902b25cb7))

## [4.5.0](https://github.com/ai-driven-dev/aidd-cli/compare/v4.4.0...v4.5.0) (2026-05-28)


### Features

* **framework-build:** add --flat / --force flags for copilot flat target ([e7c29a3](https://github.com/ai-driven-dev/aidd-cli/commit/e7c29a3834e2193d36e389b73e2bc85d844a75af)), closes [#270](https://github.com/ai-driven-dev/aidd-cli/issues/270)
* **framework-build:** aidd framework build --target codex (Mode A + agents TOML staging) ([088d294](https://github.com/ai-driven-dev/aidd-cli/commit/088d294b58939702c3cb92829009d0b42a781690)), closes [#272](https://github.com/ai-driven-dev/aidd-cli/issues/272)


### Bug Fixes

* **plugin:** aidd setup cache resolution + propagation version mismatch ([#271](https://github.com/ai-driven-dev/aidd-cli/issues/271)) ([71f5e65](https://github.com/ai-driven-dev/aidd-cli/commit/71f5e65231a201b86d8156fd8f0c97a104482591))


### Documentation

* **readme:** aidd framework build section + Copilot 2-click activation flow ([9a573de](https://github.com/ai-driven-dev/aidd-cli/commit/9a573dee06152caa519cc31aa109c33a6f75c494)), closes [#266](https://github.com/ai-driven-dev/aidd-cli/issues/266)

## [4.4.0](https://github.com/ai-driven-dev/aidd-cli/compare/v4.3.0...v4.4.0) (2026-05-25)


### Features

* **framework:** aidd framework build --target copilot generates Copilot-native marketplace ([2a10a0a](https://github.com/ai-driven-dev/aidd-cli/commit/2a10a0a23baa32530949f9b637910826d70bbd36)), closes [#266](https://github.com/ai-driven-dev/aidd-cli/issues/266)

## [4.3.0](https://github.com/ai-driven-dev/aidd-cli/compare/v4.2.1...v4.3.0) (2026-05-24)


### Features

* **plugin:** aidd plugin create &lt;name&gt; template generator ([b91cd4c](https://github.com/ai-driven-dev/aidd-cli/commit/b91cd4c0fea7e422e064ad318b1359475358778c))
* **plugin:** aidd plugin create &lt;name&gt; template generator ([#214](https://github.com/ai-driven-dev/aidd-cli/issues/214)) ([179056e](https://github.com/ai-driven-dev/aidd-cli/commit/179056ea0f14406fb36e9b9e08b11a34d1dd2f90))


### Documentation

* **readme:** promote npx as recommended install method ([#208](https://github.com/ai-driven-dev/aidd-cli/issues/208)) ([2760ee6](https://github.com/ai-driven-dev/aidd-cli/commit/2760ee6cafb4751d98c082fe404f6a39df33cb0a))
* **readme:** promote npx as the recommended install method ([#208](https://github.com/ai-driven-dev/aidd-cli/issues/208)) ([f04db4b](https://github.com/ai-driven-dev/aidd-cli/commit/f04db4bb1ca96eb709797b177475dada6b0cfa8a))

## [4.2.1](https://github.com/ai-driven-dev/aidd-cli/compare/v4.2.0...v4.2.1) (2026-05-24)


### Bug Fixes

* **manifest:** updateTrackedFileHash upserts new files ([b9cf7d7](https://github.com/ai-driven-dev/aidd-cli/commit/b9cf7d76ea2628bc05abe6868b8d760688dfdd22))
* **manifest:** updateTrackedFileHash upserts new files (codex .codex/config.json drift) ([e0b5699](https://github.com/ai-driven-dev/aidd-cli/commit/e0b56994fefe2f9f2e65d7768f1c1ef7ce7f99e2))

## [4.2.0](https://github.com/ai-driven-dev/aidd-cli/compare/v4.1.3...v4.2.0) (2026-05-23)


### Features

* **translator:** Mode B full parity — hooks + mcp for OpenCode & Cursor ([be45344](https://github.com/ai-driven-dev/aidd-cli/commit/be45344ffd7a8ae5507012a808b1656358a672fc))
* **translator:** Mode B full parity — hooks + mcp for OpenCode & Cursor ([#258](https://github.com/ai-driven-dev/aidd-cli/issues/258)) ([c3d79cc](https://github.com/ai-driven-dev/aidd-cli/commit/c3d79cc98034006a68eeee9232f3e6ac81568f2d))

## [Unreleased]

### Features

* **plugin:** `aidd plugin create <name>` — scaffold a full Claude Code plugin tree (`full | skills | agents | hooks | mcp`) with JSON Schema-validated `plugin.json` manifest and optional `marketplace.json` registration ([#214](https://github.com/ai-driven-dev/aidd-cli/issues/214))

* **plugin:** Mode B parity — Cursor user-scope hooks + mcp materialization, OpenCode MCP merge into opencode.json, OpenCode hooks skip-with-warn ([#258](https://github.com/ai-driven-dev/aidd-cli/issues/258))
  * Cursor flat install writes `<plugin>/hooks.json` (Cursor-format, `${CLAUDE_PLUGIN_ROOT}/` rewritten) and `<plugin>/mcp.json` (passthrough), both tracked in `Plugin.files` for clean uninstall
  * OpenCode flat install merges `.mcp.json` servers into `opencode.json`; disabled servers stay disabled; user-owned servers preserved; idempotent re-install; replace path drops orphaned v1 servers
  * OpenCode hooks skip emits a `logger.warn` naming the plugin and reason; zero-component plugins produce zero warnings
  * `Plugin.mcpEntries` (server-name → hash map) tracks OpenCode-contributed servers; `aidd plugin remove` unmerges them without touching user-owned servers
  * `Plugin.files` and `Plugin.mcpEntries` both round-trip through manifest JSON

## [4.1.3](https://github.com/ai-driven-dev/aidd-cli/compare/v4.1.2...v4.1.3) (2026-05-21)


### Bug Fixes

* **setup:** release picker + self-update EPERM hint ([#255](https://github.com/ai-driven-dev/aidd-cli/issues/255)) ([8205411](https://github.com/ai-driven-dev/aidd-cli/commit/82054111a69ca5e286eacc2c799ea3e40d41271e))
* **setup:** release picker for framework version + self-update EPERM hint ([7c3a151](https://github.com/ai-driven-dev/aidd-cli/commit/7c3a15177bf3cc07bd233496a6c44d59e4be0594))

## [4.1.2](https://github.com/ai-driven-dev/aidd-cli/compare/v4.1.1...v4.1.2) (2026-05-18)


### Bug Fixes

* 3 v4.1.0 polish bugs found in live smoke (v4.1.2) ([aa668a2](https://github.com/ai-driven-dev/aidd-cli/commit/aa668a2d260ffdfdd6a166025e1376ce4e3a1ebb))
* 3 v4.1.0 polish bugs found in live smoke test ([b4b3e99](https://github.com/ai-driven-dev/aidd-cli/commit/b4b3e9969c02dec987d41c0600c8e0c0db408840))

## [4.1.1](https://github.com/ai-driven-dev/aidd-cli/compare/v4.1.0...v4.1.1) (2026-05-18)


### Bug Fixes

* **doctor:** plugin doctor false-positive missing for Cursor user-scope plugins ([692d262](https://github.com/ai-driven-dev/aidd-cli/commit/692d262172ea74f23cf9bb689ce97fc56daebcf5))
* **doctor:** resolve user-scope base dir for plugin file existence check ([211a916](https://github.com/ai-driven-dev/aidd-cli/commit/211a9164ea5190d427d404fb8f29e9c7e7f96217))

## [4.1.0](https://github.com/ai-driven-dev/aidd-cli/compare/v4.0.0...v4.1.0) (2026-05-18)


### Features

* **#260:** plugin architecture — full plugin system with cross-tool translation ([#162](https://github.com/ai-driven-dev/aidd-cli/issues/162)) ([4984de6](https://github.com/ai-driven-dev/aidd-cli/commit/4984de6be22439a86a94548863444699cf2876ba))
* **#261:** plugin marketplace flow — register, browse, search, install ([21fb16f](https://github.com/ai-driven-dev/aidd-cli/commit/21fb16ffd8a7b20abd8b07eb09f771881316280f))
* **#261:** plugin marketplace flow — register, browse, search, install ([c2ea081](https://github.com/ai-driven-dev/aidd-cli/commit/c2ea0817288edc074ad8e428cf52524af765c782)), closes [#261](https://github.com/ai-driven-dev/aidd-cli/issues/261)
* **189:** Phase 1 — define PluginTranslationAdapter interface ([a4744d4](https://github.com/ai-driven-dev/aidd-cli/commit/a4744d4637242e5821149e7f1a2358963eb0b023)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **189:** Phase 2 — ModeAMarketplaceAdapter + factory + constructor injection ([037161c](https://github.com/ai-driven-dev/aidd-cli/commit/037161c0f404f097269f87a562ddbe8852e4d306)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **189:** Phase 3 — ModeBFlatMaterializationAdapter + complete factory routing ([c9ad728](https://github.com/ai-driven-dev/aidd-cli/commit/c9ad728f17a447541013eea9300133341601d8f3)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **189:** Phase 4 — verify no stray inline mode checks remain ([19d968c](https://github.com/ai-driven-dev/aidd-cli/commit/19d968c36a50d48b6b7a6600067666437a7036e6)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **189:** Phase 5 — unit tests for translator adapters ([3c5b3db](https://github.com/ai-driven-dev/aidd-cli/commit/3c5b3dbb71f28646b6c0c5cfb0d10110a789d5a4)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **192:** Cursor Mode B flat materialization to ~/.cursor/plugins/local/ ([751dba6](https://github.com/ai-driven-dev/aidd-cli/commit/751dba6ad8533f12987b3f85bb90b8faf16366c6))
* **193:** explicit translationMode declaration on PluginsCapability ([6bf3e09](https://github.com/ai-driven-dev/aidd-cli/commit/6bf3e09413237bba7ee680742745b4672072509f))
* **build:** enforce bundle size budget ([e561925](https://github.com/ai-driven-dev/aidd-cli/commit/e561925e67bc3c47269d244e35035b64f8905bac))
* **cli,assets:** bundle runtime configs + memory stubs + ResolveMarketplaceUseCase ([f28fccd](https://github.com/ai-driven-dev/aidd-cli/commit/f28fccdcb3b4b8633fd588411d0b4bf258c732ce))
* **cli:** chain globals + marketplace cache + plugin sub-cmds verified ([b259bc2](https://github.com/ai-driven-dev/aidd-cli/commit/b259bc20bd21259ceb64528f18679bc4ea6a1f3f))
* **cli:** migration auto-prompt on CLI entry ([#198](https://github.com/ai-driven-dev/aidd-cli/issues/198)) ([54a45b9](https://github.com/ai-driven-dev/aidd-cli/commit/54a45b90e58d41b83445b836a485cd777e75d591))
* **cli:** migration auto-prompt on CLI entry ([#198](https://github.com/ai-driven-dev/aidd-cli/issues/198)) ([ed14b62](https://github.com/ai-driven-dev/aidd-cli/commit/ed14b6216e63807d50527618a512a9e9b0c13cf9))
* **copilot:** ship Copilot VSCode settings as CLI-owned static content ([c371407](https://github.com/ai-driven-dev/aidd-cli/commit/c37140730f8be446912078a169569a81c7bdad1e))
* **cursor:** migrate plugin install to Mode B flat materialization at ~/.cursor/plugins/local/ ([#192](https://github.com/ai-driven-dev/aidd-cli/issues/192)) ([cc5a1f4](https://github.com/ai-driven-dev/aidd-cli/commit/cc5a1f477a3862e3bbdf7a4679a0fbdeb3ea396d))
* drop marketplace browse; add marketplace list --plugins ([#177](https://github.com/ai-driven-dev/aidd-cli/issues/177)) ([4b28f88](https://github.com/ai-driven-dev/aidd-cli/commit/4b28f88f2d175cbad60fc301897d529fe8957a8d))
* drop marketplace cache subcommands; add marketplace refresh --force ([#178](https://github.com/ai-driven-dev/aidd-cli/issues/178)) ([229f136](https://github.com/ai-driven-dev/aidd-cli/commit/229f136c186aa3628758dd09824c631326902e65))
* drop plugin status, plugin sync, plugin restore CLI surfaces ([5af8a0b](https://github.com/ai-driven-dev/aidd-cli/commit/5af8a0b4dea3c809803d2ec5f155071931dc37fa))
* **emitters:** close codex commands/rules gap + reconcile sync-matrix doc ([835d1ae](https://github.com/ai-driven-dev/aidd-cli/commit/835d1ae7402d05acbbdce36ae3eb3959746a6482))
* **format:** add Codex marketplace format adapter (Phase C) ([9af790e](https://github.com/ai-driven-dev/aidd-cli/commit/9af790eb60c78210cd166014b49f9353cf1d39cc))
* **format:** add Copilot VS Code marketplace format adapter (Phase B) ([6b8228c](https://github.com/ai-driven-dev/aidd-cli/commit/6b8228c39c392c5f66079b9f9797bde662d41c5a))
* **format:** add Cursor marketplace format adapter (Phase A) ([a015bd6](https://github.com/ai-driven-dev/aidd-cli/commit/a015bd6cfabf52b7bf9fb18dd4687e826e949b4d))
* **format:** add OpenCode marketplace format adapter (Phase D — final) ([64475cc](https://github.com/ai-driven-dev/aidd-cli/commit/64475cc0258e298768fe0dd574aae5eeb2b03c2f))
* **format:** wire Cursor marketplace parser into catalog adapter (Phase A.5) ([764a49b](https://github.com/ai-driven-dev/aidd-cli/commit/764a49b13acc1d57b4d55aca5a21ad6ac28bd671))
* **framework-loader:** drop codex-hooks and updateMemory refs — moved to plugins ([573edee](https://github.com/ai-driven-dev/aidd-cli/commit/573edee7bbe674c06e0d578bf8f20d3fd86f23f9))
* **ide:** add ide restore [files...] command ([#188](https://github.com/ai-driven-dev/aidd-cli/issues/188)) ([20b5192](https://github.com/ai-driven-dev/aidd-cli/commit/20b5192f8078f85fda6eb3d3aeab8d7ce0a88ba9))
* **ide:** add ide restore [files...] command symmetric to ai restore ([e1aef1c](https://github.com/ai-driven-dev/aidd-cli/commit/e1aef1c9eef8cc9733562a99f901363ded2a2656))
* **install:** auto-propagate plugins when adding a tool post-setup ([53a9875](https://github.com/ai-driven-dev/aidd-cli/commit/53a987507bc1701a480ea4041b4406b327df4ce9))
* **install:** propagate AI static merges when IDE installed post-setup ([5fcbfa0](https://github.com/ai-driven-dev/aidd-cli/commit/5fcbfa07fc3181f81fcc0fee26b4c5935dea9878))
* **install:** swap install ai|ide to bundled assets; add uninstall-ide use case ([54d184b](https://github.com/ai-driven-dev/aidd-cli/commit/54d184beb881a95e8ff86b86249d344acfdaba9b))
* **marketplace:** persist marketplace.json version on registry entry ([73b93c4](https://github.com/ai-driven-dev/aidd-cli/commit/73b93c4face854da32ac2382565dd1401c5633ec))
* **migrate:** add aidd migrate command for brownfield project migration ([1320ed1](https://github.com/ai-driven-dev/aidd-cli/commit/1320ed1946552505f547afc774c97515b2247cb6))
* **opencode,docs:** per-tool plugin install strategy ([a9b9ad5](https://github.com/ai-driven-dev/aidd-cli/commit/a9b9ad54b984f9180360c99d3f7717376058e8cc))
* **opencode:** enable opencode in sync matrix — expand 4×4 → 5×5 (20 pairs) ([5b0757d](https://github.com/ai-driven-dev/aidd-cli/commit/5b0757d0d962d1161a2693e0bbc4740294d64e2b))
* **perf:** add CLI boot + command perf regression detection ([ef19a5a](https://github.com/ai-driven-dev/aidd-cli/commit/ef19a5a5dbba7534086da1400d89d81719b906d4))
* **plugin:** --scope user|project flag with tool×scope validation ([#196](https://github.com/ai-driven-dev/aidd-cli/issues/196)) ([86c9b93](https://github.com/ai-driven-dev/aidd-cli/commit/86c9b931382b62dafed7572442b4e06563af0620))
* **plugin:** add --scope user|project flag with tool×scope validation ([3a942d4](https://github.com/ai-driven-dev/aidd-cli/commit/3a942d46fc50c4658b4e2643b83eaff590a37a50))
* **plugin:** fold plugin add + plugin pick into plugin install ([#179](https://github.com/ai-driven-dev/aidd-cli/issues/179), [#180](https://github.com/ai-driven-dev/aidd-cli/issues/180)) ([efaaf7d](https://github.com/ai-driven-dev/aidd-cli/commit/efaaf7d001091ae1816b524454446b159357022a))
* **plugin:** local/remote distribution modes with marketplace sync ([a2448ad](https://github.com/ai-driven-dev/aidd-cli/commit/a2448adab2dd50075e49e5af4652431c7c0826ca))
* **plugins:** add explicit translationMode field to PluginsCapability ([fed51d5](https://github.com/ai-driven-dev/aidd-cli/commit/fed51d5c8d3f08accf5fec2acbf7bcf06a73f5e0)), closes [#193](https://github.com/ai-driven-dev/aidd-cli/issues/193)
* **plugins:** add marketplaceSettings for copilot, defer cursor/codex/opencode ([63468d1](https://github.com/ai-driven-dev/aidd-cli/commit/63468d1a2b8fbd1a6a8f2154c52a4fbe62d8b0d5))
* **setup:** --no-default-marketplace opt-out flag ([#197](https://github.com/ai-driven-dev/aidd-cli/issues/197)) ([5abec53](https://github.com/ai-driven-dev/aidd-cli/commit/5abec53a71243dc2e56076591c55754811f9a4e3))
* **setup:** add --no-default-marketplace opt-out flag ([03fa807](https://github.com/ai-driven-dev/aidd-cli/commit/03fa8078605116ed1ecc41cac48449a286b29fd2))
* **setup:** improve interactive UX for setup flow ([b7c718c](https://github.com/ai-driven-dev/aidd-cli/commit/b7c718c53b0b77767c3b545cae41531f3de8d387))
* **setup:** prompt marketplace version with last-tag default ([0033113](https://github.com/ai-driven-dev/aidd-cli/commit/003311322d9a23e67f5c3b01852300d46169ff4c))
* **setup:** reorder flow — tools first, marketplace opt-in default yes ([dd3b7aa](https://github.com/ai-driven-dev/aidd-cli/commit/dd3b7aa9bf408d0d4499f2d2bc23931473004aec))
* **setup:** wizard + context detection + flag simplification ([#199](https://github.com/ai-driven-dev/aidd-cli/issues/199) [#201](https://github.com/ai-driven-dev/aidd-cli/issues/201)) ([2b628a6](https://github.com/ai-driven-dev/aidd-cli/commit/2b628a6b92a0a8c05387b89b3aade7bafe458c9d))
* **setup:** wizard with context detection + flag simplification ([97d92b0](https://github.com/ai-driven-dev/aidd-cli/commit/97d92b0d19d87572ef06d9a7729dcf5a8d627dac))
* **sync,menu:** plugin propagation inter-tool + interactive menu refresh ([3000f64](https://github.com/ai-driven-dev/aidd-cli/commit/3000f641d88836619ba12cd22790e551389834ff))
* **test:** add Stryker mutation testing scoped to migration-plan.ts ([6bc6461](https://github.com/ai-driven-dev/aidd-cli/commit/6bc64614f81668e6242270cd480a92ffea9d1c28))
* **test:** AIDD_USER_CONFIG_DIR env override + realHome opt-in for network tests ([d2d7831](https://github.com/ai-driven-dev/aidd-cli/commit/d2d7831ffc0610f2a20dce7a519a4c11b3a8cb7f))
* **tools:** implement marketplaceSettings for cursor + codex (forward-compat) ([2350084](https://github.com/ai-driven-dev/aidd-cli/commit/2350084d86be1ce7298d869a7906de043e941ce3))
* **v4.1.0:** plugin architecture + framework marketplace native support ([7cc20bd](https://github.com/ai-driven-dev/aidd-cli/commit/7cc20bda8ee95198e39bd111a778502a80281623))


### Bug Fixes

* **bugs:** correct CL3/SY5/SU1 fixes and plugin toJSON round-trip ([ec3036d](https://github.com/ai-driven-dev/aidd-cli/commit/ec3036d3e11ae7c42813c4bed30a500f28e55c27))
* **claude:** include ref in extraKnownMarketplaces.source ([7be0864](https://github.com/ai-driven-dev/aidd-cli/commit/7be0864c7781aa2cf51430d8591a6bf730d74994))
* **commitlint:** disable footer-max-line-length to allow github squash merge bodies ([dc4c12a](https://github.com/ai-driven-dev/aidd-cli/commit/dc4c12a4893d6bd461945211b28358ae6c54a77b))
* **config:** make docsDir read-only per locked decision [#10](https://github.com/ai-driven-dev/aidd-cli/issues/10) (K6) ([839389f](https://github.com/ai-driven-dev/aidd-cli/commit/839389f8e211ebe30b1e53aa5d647dc6a8352aef))
* **copilot:** gate VSCode settings merge on vscode tool presence ([33f0101](https://github.com/ai-driven-dev/aidd-cli/commit/33f0101bc812b231c9c75abe5ab7ea90f7a4b32a))
* **copilot:** rules not installing due to toolSuffix/inputSuffix mismatch ([7b93fb5](https://github.com/ai-driven-dev/aidd-cli/commit/7b93fb5c2bacd72d2082667a84e3d0049c92ab66))
* **copilot:** rules not installing due to toolSuffix/inputSuffix mismatch ([38800e7](https://github.com/ai-driven-dev/aidd-cli/commit/38800e7cf25ded90cb9face5291e295b98a72f4d))
* **copilot:** use .github/copilot/settings.json per VSCode workspace spec ([8b35c17](https://github.com/ai-driven-dev/aidd-cli/commit/8b35c17e8b5ef918885ca40a46d764f7f09c6454))
* **copilot:** write marketplaces to .vscode/settings.json per VSCode spec ([bc2b59c](https://github.com/ai-driven-dev/aidd-cli/commit/bc2b59c846f5fab5e820ef2b5b8388d41552a50b))
* **doctor,cursor:** skip tasks/ broken refs; cursor hooks in hooks/ subdir ([9fcfb27](https://github.com/ai-driven-dev/aidd-cli/commit/9fcfb2741e588faa683eab53bcacb059d5077e94))
* **doctor:** skip refs outside projectRoot (K4) ([3cc0c48](https://github.com/ai-driven-dev/aidd-cli/commit/3cc0c487c9af82a8750c835f876b01785f0835fe))
* **domain:** dedup mergeFiles entries sharing output path ([aba2d54](https://github.com/ai-driven-dev/aidd-cli/commit/aba2d5434d35ee8715f62a6578f3ba4a25a7f6c3))
* **domain:** dedup mergeFiles entries sharing output path ([13b63b0](https://github.com/ai-driven-dev/aidd-cli/commit/13b63b095a3890ff9bcf7222b1343caec2227288)), closes [#156](https://github.com/ai-driven-dev/aidd-cli/issues/156)
* **e2e,bugs:** fix CL3/SY5/SU1/ST1 bugs; update E2E_MAP to match reality ([7c59686](https://github.com/ai-driven-dev/aidd-cli/commit/7c5968601efe38d20bc504f0ec807eb3b32385d9))
* **e2e:** mock marketplace refresh for switch-mode test stability ([211fadc](https://github.com/ai-driven-dev/aidd-cli/commit/211fadc164dfd2606c2022f7c092d29f83b82d41))
* **lint:** remove unused imports and non-null assertions ([b5b3dd7](https://github.com/ai-driven-dev/aidd-cli/commit/b5b3dd72497043b610c28307fb1fbb77307ebf5b))
* **lint:** remove unused join import from marketplace-refresh-use-case ([e9d0769](https://github.com/ai-driven-dev/aidd-cli/commit/e9d076939a97b8c02bd6ecbc237b7b48072a14b1))
* **marketplace:** remove unused join import in browse use-case ([4dfb289](https://github.com/ai-driven-dev/aidd-cli/commit/4dfb289c3851068fcb1d6b45d1236cfa86da5f97))
* **marketplace:** route all catalog reads through raw fetcher (preserve ref) ([ef93862](https://github.com/ai-driven-dev/aidd-cli/commit/ef938621dbd3944add76a1042164e1ce1842467f))
* **menu:** exit interactive loop after failed setup instead of re-prompting ([cc4d060](https://github.com/ai-driven-dev/aidd-cli/commit/cc4d0607e4f823693cda2b309c1e8e6850b8f1ba))
* **menu:** use shell PWD to detect project root for pnpm sub-binary invocation ([d4d7a84](https://github.com/ai-driven-dev/aidd-cli/commit/d4d7a84fe6d179da535e6413dc29dd6f4431cbd5))
* **plugin:** materialize flat files for opencode on local marketplace ([18934cd](https://github.com/ai-driven-dev/aidd-cli/commit/18934cda7c4d6f9c78e6519fbb867a04b805210b))
* **plugin:** move assertValidAiToolId inside try/catch in sync action ([fe8a399](https://github.com/ai-driven-dev/aidd-cli/commit/fe8a3999428403c31f684b3177d66e1cc4eab12a))
* **plugin:** pass catalog metadata to plugin add for github marketplaces ([571032f](https://github.com/ai-driven-dev/aidd-cli/commit/571032f46cb7b28f16bde9215e95f531247dd7a9))
* **plugin:** remove dead MarketplaceSyncSettings dep from ModeAMarketplaceAdapter and restore zero-files guard ([fe6f22c](https://github.com/ai-driven-dev/aidd-cli/commit/fe6f22caa7fbe9551dd27a3ff1a51149e3b04c68)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **plugin:** remove unused join import in plugin use-cases ([5bd2fc1](https://github.com/ai-driven-dev/aidd-cli/commit/5bd2fc1965f5047a6bdcdf41838065edde13a74f))
* **plugin:** resolve marketplace local paths relative to framework root and include all hook files ([0051137](https://github.com/ai-driven-dev/aidd-cli/commit/0051137f5f9cea2925ae73a2064d2b34ce7c4774))
* **plugin:** skip fetch/translate/write for github marketplaces ([6218190](https://github.com/ai-driven-dev/aidd-cli/commit/621819065389124eb3d07324152851410953df0a))
* resolve four E2E-discovered bugs (BUG-2/3/5/6) ([7ddde54](https://github.com/ai-driven-dev/aidd-cli/commit/7ddde541b385b583605a8f50c415897db5eec941))
* resolve three E2E-discovered bugs — auth status exit, sync propagation, uninstall plugins ([c4bb4c2](https://github.com/ai-driven-dev/aidd-cli/commit/c4bb4c211c02daf54caf85f535df48ca2ce009e3))
* **restore:** include plugin files in restore scan when no --plugin flag given ([4bd46fd](https://github.com/ai-driven-dev/aidd-cli/commit/4bd46fda4a6d50c62564c71271207f980237b074))
* **setup,loader:** auto-refresh marketplace after registration; exclude tasks/ from docs load ([cfb5a15](https://github.com/ai-driven-dev/aidd-cli/commit/cfb5a15bcf1fd3b364a4c7de2871de49dc3115a7))
* **setup,menu:** accept relative local paths + restore banner + direct setup prompt ([d70593c](https://github.com/ai-driven-dev/aidd-cli/commit/d70593cf00c2a8af3a12d19cff1e3aa01c77f354))
* **setup:** drop marketplace repo prompt — use default automatically ([b2a8a40](https://github.com/ai-driven-dev/aidd-cli/commit/b2a8a4064493154ff4b61e21d0c930391dbcf098))
* **setup:** force re-register marketplace so ref updates on re-run ([a29a510](https://github.com/ai-driven-dev/aidd-cli/commit/a29a510e7dd1881d1a34470a273c087395dcd9c0))
* **setup:** idempotent setup re-run with new --release tag ([dc6e805](https://github.com/ai-driven-dev/aidd-cli/commit/dc6e805e3c6ecd384918d4ef0a2a936ebd17ea1a))
* **setup:** pin marketplace source to user-entered version (ref) ([aa018d6](https://github.com/ai-driven-dev/aidd-cli/commit/aa018d63b5d2161d8ff6e4c13b370f5204be1cbd))
* **setup:** show defaults in repo + version prompts (interactive) ([85dfd4b](https://github.com/ai-driven-dev/aidd-cli/commit/85dfd4b4c553f5056db9559331b9291ed571e57d))
* **setup:** sync settings AFTER plugin install (was before tools registered) ([53ce081](https://github.com/ai-driven-dev/aidd-cli/commit/53ce0812abd98520d4fa6b06bdb70ed62820abaf))
* **setup:** tool selection prompt + prerelease tag resolution + 404 fallback ([fb7bbaf](https://github.com/ai-driven-dev/aidd-cli/commit/fb7bbafee72b5fc2959aee2f11023c7c8eb58dbb))
* **test-helpers:** sandbox HOME + XDG_CONFIG_HOME in E2E child processes ([e4d5226](https://github.com/ai-driven-dev/aidd-cli/commit/e4d5226924d86756709176f9f3b10d6985824f78))
* **test:** gate --source remote E2E tests behind RUN_NETWORK_TESTS ([f44748e](https://github.com/ai-driven-dev/aidd-cli/commit/f44748efdd0dd3fd1096c52c21fb0436e7d048af))
* **test:** prevent tempfile collision in concurrent TTY expect scripts ([fac9c5c](https://github.com/ai-driven-dev/aidd-cli/commit/fac9c5c3230ae841aa4521633a4984a6c91d8566))
* **test:** type setup mocks properly to satisfy strict CI typecheck ([48092b5](https://github.com/ai-driven-dev/aidd-cli/commit/48092b55941931a7080d1892e3d8357776698424))
* **update:** remove non-null assertions and dead translateNative method ([a59deb1](https://github.com/ai-driven-dev/aidd-cli/commit/a59deb1b13e7f342be72d453fc1d19d57ab9bd25))
* **ux:** raw catalog fetch + fail-fast git + progress + auth surfacing ([68042f3](https://github.com/ai-driven-dev/aidd-cli/commit/68042f34e7291073eab5fb0feed9911eb1f6f9e2))


### Performance

* **cli:** cache update-check 24h — 613ms → 112ms on status/list ([be2a8ba](https://github.com/ai-driven-dev/aidd-cli/commit/be2a8bae05533f5cbc761e1bc12ada721ad8776c))


### Documentation

* **177-183:** add 7-command-drops plan ([8dfe0fa](https://github.com/ai-driven-dev/aidd-cli/commit/8dfe0fa828fc8948f0a3d7eb76f5f4f9dc43a2c1))
* **189:** add translator mode adapters plan ([5842a7b](https://github.com/ai-driven-dev/aidd-cli/commit/5842a7b784a56e9c48ac14e05ec074c84eca0693)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **192:** add cursor mode-b plan ([db99ca1](https://github.com/ai-driven-dev/aidd-cli/commit/db99ca15e3267ef2293c109f8f177c6ba6217d3b)), closes [#192](https://github.com/ai-driven-dev/aidd-cli/issues/192)
* **193:** add translation-mode declaration plan ([5d45018](https://github.com/ai-driven-dev/aidd-cli/commit/5d450186cbc57195b11fc5db73940f9225a3c2a4)), closes [#193](https://github.com/ai-driven-dev/aidd-cli/issues/193)
* **audit:** cli v5 DDD audit — SRP / domain purity / infra clean / harness gaps ([56a0d78](https://github.com/ai-driven-dev/aidd-cli/commit/56a0d786c07c8cbe03c920e379f424b652d43c53))
* **changelog:** tag 4.1.0-beta.1 section ([99f9604](https://github.com/ai-driven-dev/aidd-cli/commit/99f9604b9b562361573c07ae94e6429e75f544ea))
* **cli:** finalize README + CHANGELOG + migration guide for v4.1.0 ([7fcea7a](https://github.com/ai-driven-dev/aidd-cli/commit/7fcea7a8c858041a8494402fef870fc0b298a826))
* **e2e-map:** align E2E_MAP with marketplace-only architecture ([72cad3a](https://github.com/ai-driven-dev/aidd-cli/commit/72cad3a633ace3c399edfbf0e41a5750b11577b1))
* **e2e:** mark K1/K2/K3 as fixed in E2E_RESULTS ([be9d1d1](https://github.com/ai-driven-dev/aidd-cli/commit/be9d1d16e80eee5176dd39e338956b084623e259))
* **e2e:** split K5 — hooks format fixed for Claude/Copilot, cursor schema gap tracked ([f0b612b](https://github.com/ai-driven-dev/aidd-cli/commit/f0b612b05b1b6585be4e8f3ddb69bc5d9a19a613))
* **e2e:** update E2E_RESULTS — all session bugs fixed, open issues cleared ([f152b71](https://github.com/ai-driven-dev/aidd-cli/commit/f152b71449a2f80c28806f725dbf6b43f8cdcdc4))
* **memory,contributing:** align with v5 surface — strip stale refs ([af3476f](https://github.com/ai-driven-dev/aidd-cli/commit/af3476f45a321a8e46b74a33efb4d2a1bbbadb4a))
* **memory:** align aidd_docs/memory/* with post-beta.23 state ([ac6c9ed](https://github.com/ai-driven-dev/aidd-cli/commit/ac6c9edb1e028a9a51f016d6c2c89586849affce))
* **memory:** update architecture + codebase map for marketplace-only refactor ([f0678c4](https://github.com/ai-driven-dev/aidd-cli/commit/f0678c41dbfd2189635469262d41ef787a5b71f1))
* **plan:** cli v5 cleanup master + 12 part plans ([511ee5b](https://github.com/ai-driven-dev/aidd-cli/commit/511ee5beeaa2b719bb2f7a0c0dff94340062e280))
* **plan:** cli v5 follow-up master + 10 part workstream plans ([c3a3ea7](https://github.com/ai-driven-dev/aidd-cli/commit/c3a3ea76f30d8e5b292340acac4e4098ebab3616))
* **plan:** lock decisions for follow-up parts 1/2/3/6/8/9 ([840cf50](https://github.com/ai-driven-dev/aidd-cli/commit/840cf50fb882148ab84071a10ab440eddbfb5ce3))
* **planning:** add v4.1.0+ roadmap, command challenge, and issues plan ([fe1f2ff](https://github.com/ai-driven-dev/aidd-cli/commit/fe1f2ff1a176ac23ac2a4c2258dfd80503724403))
* **plan:** revise master + parts per phase 0 inventory blockers ([c6b4bee](https://github.com/ai-driven-dev/aidd-cli/commit/c6b4beef464919fb3e500ebf438459f64a14fafc))
* **review:** cli v5 final independent review ([ce91c51](https://github.com/ai-driven-dev/aidd-cli/commit/ce91c511976728d71641d89c6e590406ee5cc248))
* **review:** cli v5 post-cleanup review inventory ([5577744](https://github.com/ai-driven-dev/aidd-cli/commit/5577744eeb05b3754b19289680934833dddf6bc2))
* **rules:** clean up obsolete refs + scope global rules + trim verbosity ([f02cb31](https://github.com/ai-driven-dev/aidd-cli/commit/f02cb315376e8a55db84cb0a81c0b3e1c2ec4cc0))
* **setup:** clarify prompts and flags for marketplace architecture ([6b5e061](https://github.com/ai-driven-dev/aidd-cli/commit/6b5e06111b79aa5b14cb82e4d6740c0ea7b62dfe))
* **tasks:** add plan for opencode duplicate mergeFile fix ([e6c25d7](https://github.com/ai-driven-dev/aidd-cli/commit/e6c25d78132f9db8ece0a8f2dcf8ff391729b7da))
* update README and CHANGELOG for marketplace-only architecture ([2685396](https://github.com/ai-driven-dev/aidd-cli/commit/2685396422b1f2cbe302d63b807bc49958064e69))


### Refactoring

* **#142:** ddd capabilities — domain formats, tool registry, use-case split ([#159](https://github.com/ai-driven-dev/aidd-cli/issues/159)) ([ba6f2c8](https://github.com/ai-driven-dev/aidd-cli/commit/ba6f2c8f7226380b0f0883907e9960f1d33fbf97))
* **189:** explicit ModeA/ModeB translator adapters ([b93c4bb](https://github.com/ai-driven-dev/aidd-cli/commit/b93c4bbd6ebeeef22043b80b758b64b338c7719e))
* **adopt:** drop FrameworkLoader, scan tool dirs + register all files ([eb78f30](https://github.com/ai-driven-dev/aidd-cli/commit/eb78f30ec6e80a9e08a979b0d545748329d8f101))
* **check-update:** drop FrameworkResolver dep, CLI version banner only ([190f22a](https://github.com/ai-driven-dev/aidd-cli/commit/190f22afdb470cab15e6029d6e49847d185e29d5))
* **cli:** co-delete FrameworkCache + FrameworkResolverAdapter + adopt/ + DistributionMode ([3ef42af](https://github.com/ai-driven-dev/aidd-cli/commit/3ef42af978d52c70b07d3c1443a8b4478e506567))
* **cli:** drop docs tracking from manifest; framework now owns aidd_docs/ ([eddad9b](https://github.com/ai-driven-dev/aidd-cli/commit/eddad9bf41cdac5d8204ed25930f4d4d4c8c99ce))
* **cli:** noun-first command surface ([8c36aa7](https://github.com/ai-driven-dev/aidd-cli/commit/8c36aa780a0c81594cb555c6c2cd7635a442dc3e))
* **cli:** post-cleanup arch tidy — empty dirs, async→class, port size note ([1a06e22](https://github.com/ai-driven-dev/aidd-cli/commit/1a06e22385a4f6d63488814cc56dad89ec24f339))
* **commands:** drop 7 redundant commands per Phase 1 challenge ([1361673](https://github.com/ai-driven-dev/aidd-cli/commit/136167306fbf274b9a4e532901327be8c8fee501))
* **copilot:** consolidate VSCode settings into single asset ([bc7432c](https://github.com/ai-driven-dev/aidd-cli/commit/bc7432c3c384461f438288276d9f004229a61245))
* **copilot:** move VSCode static settings to assets/configs ([aa690c9](https://github.com/ai-driven-dev/aidd-cli/commit/aa690c984c88d1a70c7f411ef166f269d0fdd2f6))
* **deps:** lazy auth token resolution — defer gh shell-out ([d728b1e](https://github.com/ai-driven-dev/aidd-cli/commit/d728b1e69a5bfb0192895c142fc45c59fdf9d086))
* **doctor:** extract buildReport() — execute() now ≤ 20 lines ([2d3a520](https://github.com/ai-driven-dev/aidd-cli/commit/2d3a520afa01e5dda6d4b4d4ee8f90752d51ad39))
* **doctor:** split doctor-use-case (400 LOC) into orchestrator + 4 sub-use-cases ([c693274](https://github.com/ai-driven-dev/aidd-cli/commit/c6932744150cf20f6860c98b45b9ec6bd57a7b4f))
* **formats,tests:** placeholders.ts → identity (framework no longer uses placeholders) ([d1e502d](https://github.com/ai-driven-dev/aidd-cli/commit/d1e502d0afe81b337acce033ed2f81cdca55dbd3))
* **framework-loader:** remove legacy ScriptRef and MemoryScriptUseCase dead code ([e154d3a](https://github.com/ai-driven-dev/aidd-cli/commit/e154d3aaee8c81d0624315c6341e0bb51a167fb4))
* **infra:** collapse auth/ and http/ single-file subdirs into adapters/ ([542d741](https://github.com/ai-driven-dev/aidd-cli/commit/542d741acd47dce8d92f90f81ad8c96202bec4e2))
* **install,restore,update:** drop FrameworkLoader, unify memory stub generation ([6081f54](https://github.com/ai-driven-dev/aidd-cli/commit/6081f546ce2660ea40b108c77b029216feb694d8))
* **install:** drop CatalogUseCase and aidd_docs directory ([bad6bb9](https://github.com/ai-driven-dev/aidd-cli/commit/bad6bb9baf79d48e74ce2c051361c2e78f044e7b))
* **install:** extract static settings helpers + assetFile resolution ([fbfcfc2](https://github.com/ai-driven-dev/aidd-cli/commit/fbfcfc21e8aa06c71682b157f41b83ab77fb6663))
* **install:** purge --path/--release legacy branch + ResolveFrameworkUseCase ([4149aab](https://github.com/ai-driven-dev/aidd-cli/commit/4149aabfc5ff7317ae5a026e0b040961e027927d))
* **manifest:** drop dead marketplaces aggregate (v5→v6 migration) ([273573f](https://github.com/ai-driven-dev/aidd-cli/commit/273573fc6aabf87d7ce2c5f86d3f44ac6441eeef))
* **manifest:** drop repo field + aidd config command + --repo flag ([26c5aed](https://github.com/ai-driven-dev/aidd-cli/commit/26c5aed0d4891b5f3e1c2266be6fa0a00f33ab94))
* **manifest:** extract applyMigrations helper to satisfy ≤20-line method limit ([be12ac7](https://github.com/ai-driven-dev/aidd-cli/commit/be12ac70203c857582595f385f9c6e5566419efe))
* **manifest:** final v5 schema — strip dead fields + marketplaces aggregate ([54c2ac9](https://github.com/ai-driven-dev/aidd-cli/commit/54c2ac9f7f0dffe41e3a62ed490d6e33a500fbce))
* **manifest:** remove framework plugins legacy write paths ([3131b3d](https://github.com/ai-driven-dev/aidd-cli/commit/3131b3d649dac3ad9a3a664fef473668a1534e98))
* **migrate:** align with v5 clean schema — backup + strip + rewire ([9a79ce8](https://github.com/ai-driven-dev/aidd-cli/commit/9a79ce88e784c9406975a1ecaba7475d2d7f75fd))
* **plugin-arch:** remove MemoryCapability — memory stubs move to plugin ownership ([8a1e3fb](https://github.com/ai-driven-dev/aidd-cli/commit/8a1e3fb24c22052bebf9c08ab1915e2f379e65de))
* **plugin:** extract ApplyPluginFilesUseCase, fix hook companion scripts, gitignore plugins dir ([bdb1b70](https://github.com/ai-driven-dev/aidd-cli/commit/bdb1b70969e35954472e58fac93fd0c3db62cd73))
* **plugin:** move PluginTranslationMode to domain/models, cache adapter resolution, document test scope ([97a7427](https://github.com/ai-driven-dev/aidd-cli/commit/97a742740a41bf7a1d3c9a2f33e520fb482c5f54)), closes [#189](https://github.com/ai-driven-dev/aidd-cli/issues/189)
* **plugins:** replace two-field factory derivation with translationMode read ([d3de3fb](https://github.com/ai-driven-dev/aidd-cli/commit/d3de3fb82532dc908979e94fd1433bd4f37ce9d9)), closes [#193](https://github.com/ai-driven-dev/aidd-cli/issues/193)
* **ports:** split FileSystem into FileReader + FileWriter + FileMerger ([7d177d4](https://github.com/ai-driven-dev/aidd-cli/commit/7d177d451074b69497f786f77dce28d7fcb13a8f))
* **restore,update:** drop --path/--release flags (Phase 1.5c partial) ([e557542](https://github.com/ai-driven-dev/aidd-cli/commit/e557542d45ddfceb878b01f4e3ec3a56c2e8ff0c))
* **restore:** split restore-use-case (396 LOC) into orchestrator + sub-use-cases ([d2bb6c4](https://github.com/ai-driven-dev/aidd-cli/commit/d2bb6c40d6b16878369be92100e06acec7fa09d8))
* **setup:** drop FrameworkResolver from setup-use-case (Phase 1.5b) ([24c8f3c](https://github.com/ai-driven-dev/aidd-cli/commit/24c8f3c998154b81a9dfabc9ad7d2f3613e49421))
* **setup:** rewrite as orchestrator with sub-use-cases ([397394c](https://github.com/ai-driven-dev/aidd-cli/commit/397394ce0156b9a41b842e7d1981cb13d2c2cc23))
* **sync:** inject sub-use-cases via constructor + add unit tests ([ed8def7](https://github.com/ai-driven-dev/aidd-cli/commit/ed8def710652d41be4505d96a3abe3878494f123))
* **sync:** split sync-use-case (876 LOC) into orchestrator + 3 sub-use-cases ([e4af038](https://github.com/ai-driven-dev/aidd-cli/commit/e4af038bc9fb7f3f30ae44bf69c7db708e346bd3))
* **test:** rename InMemoryFileSystem → InMemoryFileAdapter, fix stale comment ([b71e304](https://github.com/ai-driven-dev/aidd-cli/commit/b71e304fcd8ae8f8193738d13b03b299482d5bd5))
* **uninstall:** reuse deletePluginFiles in removePluginFiles ([cf3bf5f](https://github.com/ai-driven-dev/aidd-cli/commit/cf3bf5f62cb86a0f439ef6799f9a7ce4d81cd934))
* **uninstall:** split uninstall-use-case (360 LOC) into orchestrator + sub-use-cases ([dcf1a87](https://github.com/ai-driven-dev/aidd-cli/commit/dcf1a87875f3472b8b74f7bbde122b6266aa8f1f))

## [4.1.0] — Unreleased — Noun-first surface + plugin architecture (CLI v5)

> Consolidates `4.1.0-beta.1` through `4.1.0-beta.23`. Full details in each beta section below.
> Version bump and npm publish are handled by the release-please PR on `main`.

### Breaking changes

All `4.0.x` command spellings are removed. Run `aidd migrate` to clean obsolete manifest entries.

| Old command (4.0.x) | New command (4.1.0) | Notes |
|---|---|---|
| `aidd install ai <tool>` | `aidd ai install <tool>` | Noun-first |
| `aidd install ide <tool>` | `aidd ide install <tool>` | Noun-first |
| `aidd uninstall ai <tool>` | `aidd ai uninstall <tool>` | Noun-first |
| `aidd uninstall ide <tool>` | `aidd ide uninstall <tool>` | Noun-first |
| `aidd cache list` | `aidd marketplace cache list` | Cache scoped to marketplace |
| `aidd cache clear` | `aidd marketplace cache clear` | Cache scoped to marketplace |
| `aidd config list\|get\|set` | removed | `docsDir`/`repo` keys dropped from manifest v5 |
| `aidd sync --source <tool>` | `aidd ai sync --source <tool>` | Under `ai` noun |
| `aidd restore` | `aidd ai restore` | Under `ai` noun |
| `--repo` global flag | removed | Use `aidd marketplace add` |
| `--docs-dir` on setup | removed | `docsDir` field removed from manifest v5 |
| `--mode` on setup/install | removed | Replaced by `--source local\|remote` on `aidd setup` |
| `--path` on install | removed | Local path only via `aidd setup --source local --path` |
| `--release`, `--from`, `--switch-mode` on install/setup | removed | Framework tarball download eliminated |

### New features

- **Plugin-aware read & write commands** — `aidd ai status --plugin <name>`, `aidd ai doctor --plugin <name>`, `aidd ai restore --plugin <name>`, `aidd ai sync --plugin <name>` all narrow the operation to a single plugin; backward-compat (omitted flag = current global behavior); plugin drift now surfaces in `ai status` even without `--plugin`
- **Migration auto-prompt on CLI entry** — every command checks the manifest for legacy schema fields (docsDir, repo, mode, scripts top-level, etc.); TTY prompts to migrate inline, non-TTY exits 1 with `Run aidd migrate` hint. Bypassed for `migrate`, `self-update`, `auth` commands.
- **Setup wizard with project context detection** — interactive `aidd setup` now prints a welcome banner, detects the project context (TypeScript / Python / monorepo / AIDD already installed), uses it to mark recommended tools in the multi-checkbox prompt, and prints next-step suggestions after install
- **Setup flag simplification (10 → 6)** — unified `--plugins <none|all|recommended|name1,name2>`; dropped `--all`, `--all-plugins`, `--recommended-plugins`, `--no-plugins`. Use `--ai all --ide all` instead of `--all`. Migration table in MIGRATION.md.
- **`aidd ide restore [files...]`** — symmetric to `ai restore`; reverts tracked IDE-managed files to installed state (manifest hashes); supports `--tool <vscode>` and `--force`
- **Noun-first command surface** — `aidd ai <verb>`, `aidd ide <verb>`, `aidd marketplace <verb>`, `aidd plugin <verb>`
- **Manifest v5 schema** — removed `docsDir`, `repo`, `mode`, `scripts`, `topPlugins` fields; structure is `{ version, tools, marketplaces }`
- **Plugin architecture** — memory stubs (CLAUDE.md, AGENTS.md, copilot-instructions.md) are plugin-owned via `aidd-context`; not bundled in the CLI binary
- **Marketplace cache** — `aidd marketplace cache list|clear` manages fetched catalogs; `MarketplaceCacheEntry` tracks fetch time and size
- **Plugin sync** — `aidd ai sync` propagates installed plugins from source to target tools via content translation
- **Format adapters** — ingest Cursor, GitHub Copilot, Codex, and OpenCode native marketplace formats (normalized into the common AIDD schema)
- **`--release <tag>` on setup** — pins the marketplace version fetched during `aidd setup --source remote`
- **Bundle budget** — `dist/cli.js` gated at 500 KB; checked on every build (current: ~440 KB)
- **`aidd migrate` command** — detects and strips obsolete manifest entries (scripts, top-level plugins, docsDir); backs up manifest before write; idempotent
- **Default marketplace pre-registered** — `aidd setup` registers `github.com/ai-driven-dev/aidd-framework` automatically; no auth required for public marketplace
- **OpenCode sync support** — sync matrix expanded from 4×4 (16 pairs) to 5×5 (20 pairs) including OpenCode
- **Persona-driven E2E** — real-framework-fixture E2E journeys for all 5 AI tools; no network gates in default suite
- **Perf regression detection** — `pnpm bench` + `pnpm bench:check` compare against committed baseline; >50% regression fails CI
- **Raw catalog fetch** — `aidd marketplace refresh` routes all catalog reads through a raw GitHub fetcher (preserves ref, surfaces auth errors)

### Bug fixes

- **setup:** show defaults in repo + version prompts (interactive)
- **setup:** drop marketplace repo prompt — use default automatically
- **setup:** sync settings AFTER plugin install (was written before tools were registered)
- **setup:** force re-register marketplace so ref updates on re-run
- **setup:** accept relative local paths + restore banner + direct setup prompt
- **plugin:** skip fetch/translate/write for GitHub marketplaces (was duplicating content)
- **plugin:** pass catalog metadata to `plugin add` for GitHub marketplaces
- **plugin:** materialize flat files for OpenCode on local marketplace installs
- **marketplace:** route all catalog reads through raw fetcher (preserve ref)
- **claude:** include `ref` in `extraKnownMarketplaces.source`
- **ux:** fail-fast git auth surfacing + progress indicators on remote fetch

### Internal

- **Drop unused `Logger` constructor injection** from `StatusUseCase` and `StatusAllUseCase` — eliminates biome `noUnusedPrivateClassMembers` warning; updates 5 call sites and 3 test files
- **Split `InstallRuntimeConfigUseCase.execute`** into `execute` + `applyAndTrack` private helper — each method ≤20 lines per the size rule
- **`--no-default-marketplace` flag** on `aidd setup` — opts out of auto-registering `aidd-framework`. Skips the marketplace source prompt, register, refresh, and plugin install steps. Tool installs still proceed normally.
- **`--scope user|project` flag** on `aidd plugin install` and `aidd marketplace add` (replaces `--user`). Validates against the tool's supported scope: Cursor user-only, Claude/Codex/Copilot/OpenCode project-only. Mismatch surfaces `InvalidPluginScopeError`.
- **Translator dual-mode reference doc** — `aidd_docs/translator-dual-mode.md` documents the three routing dimensions (`mode`, `translationMode`, `installScope`), tool×mode matrix, and step-by-step new-tool guide; linked from CONTRIBUTING.md
- **Per-mode integration suite** — `install-plugin-<tool>-mode-<a|b>.integration.test.ts` for Claude/Copilot/Codex (Mode A) and OpenCode/Cursor (Mode B); quality gate for the core translator
- **Test pyramid inversion** — 6 main-journey E2E tests; most integration tests demoted to unit
- **Mutation testing baseline** — Stryker scoped to `migration-plan.ts`; baseline established
- **DDD splits** — `sync-use-case` (876 LOC), `restore-use-case` (396 LOC), `uninstall-use-case` (360 LOC), `doctor-use-case` (400 LOC) each split into orchestrator + sub-use-cases
- **FileSystem port split** — `FileSystem` split into `FileReader` + `FileWriter` + `FileMerger`
- **Infra collapse** — `auth/` and `http/` single-file subdirs merged into `adapters/`
- **Property-based tests** — Manifest serialize/deserialize/migrate round-trips (fast-check)
- **Automated command matrix** — `command-matrix.md` → table-driven E2E; `sync-matrix.md` → 12-pair plugin sync E2E
- **Nightly network E2E** — gated behind `RUN_NETWORK_TESTS=1`; runs automatically via `.github/workflows/network-e2e.yml`

### Included beta releases

- `4.1.0-beta.23` — OpenCode flat-file plugin install, per-tool plugin strategy
- `4.1.0-beta.22` — marketplaceSettings for Cursor + Codex (forward-compat)
- `4.1.0-beta.21` — fix setup: sync settings order, marketplace re-register, persona E2E
- `4.1.0-beta.20` — setup: prompt marketplace version with last-tag default; raw catalog fetch
- `4.1.0-beta.19` — Copilot + OpenCode marketplaceSettings; fix plugin github skip
- `4.1.0-beta.18` — OpenCode format adapter (Phase D); fix catalog metadata in plugin add
- `4.1.0-beta.17` — Codex format adapter (Phase C)
- `4.1.0-beta.16` — Copilot VS Code format adapter (Phase B)
- `4.1.0-beta.15` — Cursor marketplace parser integration (Phase A.5)
- `4.1.0-beta.14` — OpenCode in sync matrix (4×4 → 5×5); Codex commands/rules gap close
- `4.1.0-beta.13` — FileSystem port split (FileReader + FileWriter + FileMerger)
- `4.1.0-beta.12` — Perf regression detection; AIDD_USER_CONFIG_DIR env override; mutation testing baseline; network E2E nightly workflow
- `4.1.0-beta.11` — noun-first surface, plugin sync, build-dist, bundle budget; DDD splits; test pyramid inversion
- `4.1.0-beta.10` and earlier — marketplace architecture, migrate command, bundled configs

---

## [4.1.0-beta.11] — Noun-first surface + plugin architecture (CLI v5)

### Breaking Changes

Commands removed or restructured since 4.0.x:

| Old command | New command | Notes |
|---|---|---|
| `aidd install ai <tool>` | `aidd ai install <tool>` | Noun-first: `ai` is the noun |
| `aidd install ide <tool>` | `aidd ide install <tool>` | Noun-first: `ide` is the noun |
| `aidd uninstall ai <tool>` | `aidd ai uninstall <tool>` | Noun-first |
| `aidd uninstall ide <tool>` | `aidd ide uninstall <tool>` | Noun-first |
| `aidd cache list` | `aidd marketplace cache list` | Cache scoped to marketplace |
| `aidd cache clear` | `aidd marketplace cache clear` | Cache scoped to marketplace |
| `aidd config list\|get\|set` | removed | `docsDir`/`repo` keys dropped from manifest v5 |
| `aidd sync --source <tool>` | `aidd ai sync --source <tool>` | Under `ai` noun |
| `aidd restore` | `aidd ai restore` | Under `ai` noun |
| `aidd status` | `aidd ai status` / `aidd ide status` | Per-noun subcommands (global `aidd status` still works) |
| `aidd doctor` | `aidd ai doctor` / `aidd ide doctor` | Per-noun subcommands (global `aidd doctor` still works) |
| `aidd update` | `aidd ai update` / `aidd ide update` | Per-noun subcommands (global `aidd update` still works) |
| `--docs-dir` on setup | removed | `docsDir` field removed from manifest v5 |
| `--mode` on setup/install | removed | Replaced by `--source local\|remote` on `aidd setup` |
| `--path` on install | removed | Local framework path only used in `aidd setup --source local --path` |
| `--release`, `--repo`, `--from`, `--switch-mode` on install/setup | removed | Framework tarball download eliminated |

### New Surface (noun-first commands)

```bash
# AI tools
aidd ai install claude
aidd ai uninstall cursor
aidd ai list
aidd ai status
aidd ai update [tool]
aidd ai sync --source claude [--target cursor] [--force] [--no-plugins]
aidd ai restore [files...] [--tool claude] [--force]
aidd ai doctor

# IDE tools
aidd ide install vscode
aidd ide uninstall vscode
aidd ide list
aidd ide status
aidd ide update [tool]
aidd ide doctor

# Setup (scriptable, non-interactive)
aidd setup --source remote --ai claude --ide vscode --recommended-plugins --yes

# Marketplace cache
aidd marketplace cache list
aidd marketplace cache clear [--all]
```

### Migration Guide (from 4.0.x)

1. Run `aidd migrate` to clean obsolete manifest entries (scripts, top-level plugins, docsDir).
2. Replace `aidd install ai <tool>` → `aidd ai install <tool>` in scripts.
3. Replace `aidd install ide <tool>` → `aidd ide install <tool>` in scripts.
4. Replace `aidd uninstall ai <tool>` → `aidd ai uninstall <tool>` in scripts.
5. Replace `aidd cache` → `aidd marketplace cache` in scripts.
6. Replace `aidd sync --source <tool>` → `aidd ai sync --source <tool>` in scripts.
7. Remove any `aidd config` calls — config keys (docsDir, repo) are no longer in the manifest.

### Plugin Architecture

- Memory ownership moved to plugins: CLAUDE.md/AGENTS.md/copilot-instructions.md stubs are no longer bundled in the CLI; the `aidd-context` plugin provides them.
- Plugin sync (`aidd ai sync`) propagates installed plugins from source tool to target tools via re-translation of capability files.
- `MarketplaceCacheEntry` tracks catalog fetch time and size; `aidd marketplace cache` manages this cache.
- Manifest v5 schema: removed `docsDir`, `repo`, `mode`, `scripts`, `topPlugins`.

## [4.1.0-beta.1] — Marketplace-only architecture

### ⚠ BREAKING CHANGES

* **install**: `aidd install ai <tool>` and `aidd install ide <tool>` now write bundled runtime configs from the CLI binary instead of downloading a framework tarball. The `--release`, `--path`, `--repo`, `--from`, and `--mode` flags are removed from `install` and `setup`.
* **setup**: `aidd setup` no longer downloads a framework tarball. It initializes the manifest, registers the default marketplace, and writes bundled configs. `--switch-mode` and `--mode` flags removed.
* **framework**: Framework is now a pure plugin marketplace (Git repo with `marketplace.json` + `plugins/`). The CLI no longer fetches or caches framework tarballs. `aidd cache` command removed.
* **config**: `repo` config key removed. Use `aidd marketplace` to manage marketplace sources.

### Features

* **migrate**: new `aidd migrate` command — detects and strips obsolete manifest entries (scripts section, top-level plugins section, bundled plugins) from projects on previous CLI versions. Backs up manifest before write. `--dry-run` and `--non-interactive` flags.
* **assets**: runtime configs (Claude, Cursor, Copilot, OpenCode, Codex) and memory stubs (CLAUDE.md, AGENTS.md, copilot-instructions.md) bundled inside the CLI binary — no network required for `aidd install ai`.
* **plugin install**: prompts for target tools when multiple AI tools installed; `--tool` flag for non-interactive use.
* **marketplace**: default marketplace (`github.com/ai-driven-dev/aidd-framework`) pre-registered on `aidd setup`. No auth required for public marketplace.

### Migration

Run `aidd migrate` to clean up any project initialized with CLI < 4.1.0.

## [4.0.0](https://github.com/ai-driven-dev/aidd-cli/compare/v3.3.1...v4.0.0) (2026-04-23)


### ⚠ BREAKING CHANGES

* **cli:** `aidd install <toolId>` and `aidd uninstall <toolId>` without a category prefix are no longer valid. Use `aidd install ai <toolId>` or `aidd install ide <toolId>` instead.
* **cli:** `aidd install <toolId>` and `aidd uninstall <toolId>` without a category prefix are no longer valid. Use `aidd install ai <toolId>` or `aidd install ide <toolId>` instead.

### Features

* **cli:** enforce category prefix for install and uninstall commands ([ae34aec](https://github.com/ai-driven-dev/aidd-cli/commit/ae34aece30aa3c0d9f32f9110221cb8589d8d25f))
* **cli:** enforce category prefix for install and uninstall commands ([cc781e3](https://github.com/ai-driven-dev/aidd-cli/commit/cc781e312bf13ceca8d55c3e27c2ee8fc705d725))
* **setup:** ai/ide category filter + replace --tools with --ai/--ide/--all ([e2280b2](https://github.com/ai-driven-dev/aidd-cli/commit/e2280b2167dc7cec32d515fbebcdae3e74982122))


### Bug Fixes

* **auth:** move AuthContext out of domain port into infrastructure ([75cc175](https://github.com/ai-driven-dev/aidd-cli/commit/75cc175d742ebba71eb12a5fbd7e16a9ef4f4bb6))
* **auth:** replace httpGet function injection with typed LoginVerifier ports ([e0bf067](https://github.com/ai-driven-dev/aidd-cli/commit/e0bf0672348f02b37aa75878452d2845c9402717))
* **install:** aggregate MCP keys and prompt once across all tools ([ff09210](https://github.com/ai-driven-dev/aidd-cli/commit/ff09210df092d4d27350913055e532f02ea20a77)), closes [#142](https://github.com/ai-driven-dev/aidd-cli/issues/142)
* **install:** clarify missing IDE warning with specific feature list ([6e16517](https://github.com/ai-driven-dev/aidd-cli/commit/6e165172e41481b90e5cab88bd9d42cc8be7ebb6))
* **install:** require ai|ide category prefix, improve command help ([ee88851](https://github.com/ai-driven-dev/aidd-cli/commit/ee8885177533e92cbcd4d515c5efffa79141b6c8))
* **install:** skip IDE-rooted files when required IDE is not installed ([fa445dc](https://github.com/ai-driven-dev/aidd-cli/commit/fa445dc65c7e2b0df0735758e5d2af294df2df1c)), closes [#143](https://github.com/ai-driven-dev/aidd-cli/issues/143)
* **mcp:** prompt once per install/update across all tools ([e475621](https://github.com/ai-driven-dev/aidd-cli/commit/e47562126650ab6859b86742e2723a7d96a9fb42))
* **uninstall:** strip entries from keyed-section merge files instead of deleting ([4b2222b](https://github.com/ai-driven-dev/aidd-cli/commit/4b2222b57bfcfe2c1226b616283fc20037678aae))
* **update:** aggregate MCP entries and prompt once across all tools ([1bd816c](https://github.com/ai-driven-dev/aidd-cli/commit/1bd816c310c314465212ebfaddf639da70dd9e75)), closes [#142](https://github.com/ai-driven-dev/aidd-cli/issues/142)


### Documentation

* **tasks:** add auth refactor plan and code review ([e57c527](https://github.com/ai-driven-dev/aidd-cli/commit/e57c5275fb47fcacd9cb2360f22203e8cdce2fbb))
* **tasks:** add mcp single-prompt plans and code review ([652ae71](https://github.com/ai-driven-dev/aidd-cli/commit/652ae714a4d08f7a8603c60a4f36cf40b83df308))


### Refactoring

* **auth:** introduce AuthCredential union and move credential resolution to command ([3c97d37](https://github.com/ai-driven-dev/aidd-cli/commit/3c97d378b8ba2944158ac5d8e1b40e050c214f48))
* **auth:** pure use-case via resolveContext port method ([d04a3c3](https://github.com/ai-driven-dev/aidd-cli/commit/d04a3c365548e9e03332f5b667b21b31ec3574ed))
* **auth:** use-cases receive one LoginVerifier, method resolved at command level ([76d81cf](https://github.com/ai-driven-dev/aidd-cli/commit/76d81cfb8f979410cb735913e0095704d07e6d94))
* **domain:** extract AIDD_DIR to shared paths constant ([a8a4dde](https://github.com/ai-driven-dev/aidd-cli/commit/a8a4ddece39220b0e5868b02a2375c0132af5db3))
* **mcp:** centralize prompt logic in shared McpUseCase ([90993e9](https://github.com/ai-driven-dev/aidd-cli/commit/90993e94063bea628d7cbb94d9cc5788dd683b93)), closes [#142](https://github.com/ai-driven-dev/aidd-cli/issues/142)
* **uninstall:** extract isMergeContentEmpty to domain and split removeMergeFile ([1c82cd6](https://github.com/ai-driven-dev/aidd-cli/commit/1c82cd6badb1b0bae9c47630ad7f40c9caf11fb8))
* **uninstall:** format code for better readability ([e2352e1](https://github.com/ai-driven-dev/aidd-cli/commit/e2352e106d25c1db2a2fb2c93112d16c59fd74d9))

## [3.3.1](https://github.com/ai-driven-dev/aidd-cli/compare/v3.3.0...v3.3.1) (2026-04-21)


### Bug Fixes

* **setup:** handle post-uninstall state when aidd_docs/ exists without manifest ([490649c](https://github.com/ai-driven-dev/aidd-cli/commit/490649c21f9c27bdcf0f2b21d4cba8eac93e825b))
* **setup:** handle post-uninstall state where aidd_docs/ exists without manifest ([bb6c0f7](https://github.com/ai-driven-dev/aidd-cli/commit/bb6c0f70e4dbf3eba46b13a2302fa4ba961cc3af)), closes [#141](https://github.com/ai-driven-dev/aidd-cli/issues/141)

## [3.3.0](https://github.com/ai-driven-dev/aidd-cli/compare/v3.2.0...v3.3.0) (2026-04-14)


### Features

* **mcp:** disable MCP servers by default ([6023436](https://github.com/ai-driven-dev/aidd-cli/commit/602343681b379f920634a0cc962eee7bdb397c1e))
* **mcp:** disable MCP servers by default, require explicit opt-in ([370f196](https://github.com/ai-driven-dev/aidd-cli/commit/370f196641d85474b3ae71efcc98875a7b687619))

## [3.2.0](https://github.com/ai-driven-dev/aidd-cli/compare/v3.1.4...v3.2.0) (2026-04-14)


### Features

* **domain:** granular MCP server selection during install/uninstall ([#259](https://github.com/ai-driven-dev/aidd-cli/issues/259)) ([d544c32](https://github.com/ai-driven-dev/aidd-cli/commit/d544c324f72a1fb693fc6ad0521309e5754ec4bc))
* **domain:** per-entry hash tracking for merge config files ([#131](https://github.com/ai-driven-dev/aidd-cli/issues/131)) ([61617bb](https://github.com/ai-driven-dev/aidd-cli/commit/61617bbbe606f8d4a3dc86109856fdeee963c673))
* granular MCP server selection during install/uninstall ([f172f6b](https://github.com/ai-driven-dev/aidd-cli/commit/f172f6b4bc2834d50926c71f94953bc5561b9739))


### Documentation

* **decisions:** add DEC-022, DEC-023 for MCP exclusion tracking ([df3cc8e](https://github.com/ai-driven-dev/aidd-cli/commit/df3cc8e3d7939c0fb8b8b79b4e6718d7a204c4ae))
* **errors:** update architecture rules, decisions, and memory ([904922f](https://github.com/ai-driven-dev/aidd-cli/commit/904922f32d452ed23a45590e651b2bc88b3faf0d))
* **tasks:** add code review for granular MCP selection refactor ([571feb8](https://github.com/ai-driven-dev/aidd-cli/commit/571feb82c0cf3d6ef4ad7cbaf51dcbf073a49cd6))
* **tasks:** add granular MCP selection plans and review ([aaaa433](https://github.com/ai-driven-dev/aidd-cli/commit/aaaa433457f71cf25f99846fb52616cc8009d928))


### Refactoring

* **errors:** introduce typed domain exceptions and ErrorHandler ([112416a](https://github.com/ai-driven-dev/aidd-cli/commit/112416a7d5f8318dff23186b4a8839cf70b3d70f))
* **errors:** introduce typed domain exceptions and ErrorHandler ([c726895](https://github.com/ai-driven-dev/aidd-cli/commit/c726895f2cf44da5c17f241de27596321cbe6b16)), closes [#113](https://github.com/ai-driven-dev/aidd-cli/issues/113)
* **mcp:** extract MCP selection into shared use-case and domain functions ([9156b70](https://github.com/ai-driven-dev/aidd-cli/commit/9156b700af828e8185187e9cfdbee38e5d90f786))

## [3.1.4](https://github.com/ai-driven-dev/aidd-cli/compare/v3.1.3...v3.1.4) (2026-04-07)


### Bug Fixes

* **setup:** show triggering files when adopt requires version ([e1219fe](https://github.com/ai-driven-dev/aidd-cli/commit/e1219fee6b5d88682918f7c6cd841f73bdb27fba))
* **setup:** surface adopt-trigger signals in error to help diagnose stuck state ([1b2fe39](https://github.com/ai-driven-dev/aidd-cli/commit/1b2fe394aa5038987cf08611796a5f602c604d40)), closes [#118](https://github.com/ai-driven-dev/aidd-cli/issues/118)
* **update:** preserve user MCP config customizations with merge strategy ([#125](https://github.com/ai-driven-dev/aidd-cli/issues/125)) ([fab1b41](https://github.com/ai-driven-dev/aidd-cli/commit/fab1b4182faf0ff5f1239200267e5b7c4062922b))

## [3.1.3](https://github.com/ai-driven-dev/aidd-cli/compare/v3.1.2...v3.1.3) (2026-04-06)


### Bug Fixes

* **banner:** clean up stdin listener after animation to prevent arrow key exit ([eacd585](https://github.com/ai-driven-dev/aidd-cli/commit/eacd585ae5e68fc4c7b6eae025d481b65185846c)), closes [#116](https://github.com/ai-driven-dev/aidd-cli/issues/116)
* **banner:** clean up stdin listener to prevent arrow key exit on Linux ([8acabc8](https://github.com/ai-driven-dev/aidd-cli/commit/8acabc8d7c2cfcb7713579f4ec97b6f7f4e4fa38))
* remove obsolete script files after framework renames them ([961a2fd](https://github.com/ai-driven-dev/aidd-cli/commit/961a2fdf96b4383d00a65932fa19e80d79da8d94))
* remove obsolete script files after framework renames them ([050a383](https://github.com/ai-driven-dev/aidd-cli/commit/050a3836cd73d40283423dd8dff6d16a3877c90e))
* **setup:** detect existing docs dir as adopt signal when manifest is missing ([0081ee3](https://github.com/ai-driven-dev/aidd-cli/commit/0081ee3534948c4e8a0230f7c9a62cb7b6fd9675))
* **setup:** detect existing docs dir as adopt signal when manifest is missing ([b7ab77c](https://github.com/ai-driven-dev/aidd-cli/commit/b7ab77c02e9f31e36002a608734745a6eb1bfd01)), closes [#118](https://github.com/ai-driven-dev/aidd-cli/issues/118)

## [3.1.2](https://github.com/ai-driven-dev/aidd-cli/compare/v3.1.1...v3.1.2) (2026-04-02)


### Bug Fixes

* **cursor:** normalise bare command path references during content rewrite ([de88d72](https://github.com/ai-driven-dev/aidd-cli/commit/de88d72d61313332e761b639845bc0f0f83f726e))
* **opencode:** normalise bare command path references during content rewrite ([3e3437f](https://github.com/ai-driven-dev/aidd-cli/commit/3e3437fb136fdb18cf12633121e608c249912a6a)), closes [#57](https://github.com/ai-driven-dev/aidd-cli/issues/57)
* **self-update:** add read:packages scope + typed UpdateError ([9f6bb04](https://github.com/ai-driven-dev/aidd-cli/commit/9f6bb04bb8f6d8d275e2aa0abb104e9b8e99e98e))
* **self-update:** fix package manager detection on Windows ([6c26584](https://github.com/ai-driven-dev/aidd-cli/commit/6c265844d736a526e216f0af963a99b0c659048f))
* **self-update:** fix package manager detection on Windows ([8f61eb1](https://github.com/ai-driven-dev/aidd-cli/commit/8f61eb17cfc85db105ed010266f1376480782fcd))
* **self-update:** throw typed UpdateError when package install fails ([df245b5](https://github.com/ai-driven-dev/aidd-cli/commit/df245b54c9c7e67e129ab0136e2ba2e03fea5d7f)), closes [#109](https://github.com/ai-driven-dev/aidd-cli/issues/109) [#113](https://github.com/ai-driven-dev/aidd-cli/issues/113)


### Documentation

* document read:packages scope requirement for GitHub token ([6772bbb](https://github.com/ai-driven-dev/aidd-cli/commit/6772bbb94a7448a32814ec8d90a56399794d12a4))

## [3.1.1](https://github.com/ai-driven-dev/aidd-cli/compare/v3.1.0...v3.1.1) (2026-03-30)


### Bug Fixes

* tolerate JSONC trailing commas in existing opencode.json ([7f0bfca](https://github.com/ai-driven-dev/aidd-cli/commit/7f0bfca))


### Refactoring

* application layer — methods ≤ 20 lines, shared use-cases, domain types ([5aacadc](https://github.com/ai-driven-dev/aidd-cli/commit/5aacadc))


## [3.1.0](https://github.com/ai-driven-dev/aidd-cli/compare/v3.0.0...v3.1.0) (2026-03-24)


### Features

* **setup:** add non-interactive mode support ([368520d](https://github.com/ai-driven-dev/aidd-cli/commit/368520d6e68bfafad683643840d26a6d5e34172c))
* **setup:** add non-interactive mode support ([651c034](https://github.com/ai-driven-dev/aidd-cli/commit/651c034cd3a22a8df930e98b1b69dd3b2160eaa2))


### Bug Fixes

* **setup:** disable prompts when scripting flags are provided ([3076c08](https://github.com/ai-driven-dev/aidd-cli/commit/3076c080d1e3b49679121abd613addbf9ed84491))
* **setup:** only --all-tools and --tools suppress interactive prompts ([d34d267](https://github.com/ai-driven-dev/aidd-cli/commit/d34d267fa01f995411b2ff8cbcaa1f8c2e8ca234))
* **setup:** remove --docs-dir from scripting flags detection ([5babd58](https://github.com/ai-driven-dev/aidd-cli/commit/5babd585ab540918ade15a8d0570268c7964d986))


### Documentation

* **setup:** document non-interactive flags and update project brief ([796e7d3](https://github.com/ai-driven-dev/aidd-cli/commit/796e7d32be58ddeb3a8f11e41617e42632f6a3f8))


### Refactoring

* **setup:** fix review issues — move flag guard, dedup source resolution, rename tests ([5d33588](https://github.com/ai-driven-dev/aidd-cli/commit/5d33588496062d9b45b954a31c8920746b48d3b2))

## [3.0.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.13.4...v3.0.0) (2026-03-24)


### ⚠ BREAKING CHANGES

* CLI rebuilt from scratch; prior configurations are not compatible.

### Features

* add 1.5s pause after banner to let user read it ([98ce223](https://github.com/ai-driven-dev/aidd-cli/commit/98ce2231b9147a6f7d3550a3e275abe3d6dc4444))
* add AI-Driven Dev label above logo in corner frame ([31bf641](https://github.com/ai-driven-dev/aidd-cli/commit/31bf641e4e9351347bceee2bcf1539025aa9a5f4))
* add lefthook child-to-parent delegation + auto-install ([2e7cd87](https://github.com/ai-driven-dev/aidd-cli/commit/2e7cd87165da8646538bf3d420f526f50ecaae51))
* **adopt:** add adopt command for manual installation migration ([b34bc6b](https://github.com/ai-driven-dev/aidd-cli/commit/b34bc6b5361ecdce9652a4d6f2ba28f994d24c40))
* **adopt:** resolve framework at adoption to classify framework vs user files ([88fcce3](https://github.com/ai-driven-dev/aidd-cli/commit/88fcce32b5f01f45e73b7dc4a575c178cd94cfbe))
* animated ANSI banner with glitch effect on CLI launch ([2f6f43e](https://github.com/ai-driven-dev/aidd-cli/commit/2f6f43e2c34d78b2f84275966fb0f942070da6ac))
* animated ANSI banner with glitch effect on CLI launch ([#64](https://github.com/ai-driven-dev/aidd-cli/issues/64)) ([9b62bb6](https://github.com/ai-driven-dev/aidd-cli/commit/9b62bb62b02f323da3463705fa1c9241b0797152))
* any keypress skips the entire banner animation ([3ec92cd](https://github.com/ai-driven-dev/aidd-cli/commit/3ec92cdc53a3f668174be9a18078bf55748d0692))
* **auth:** add aidd auth login/logout/status and centralize token resolution ([77188ee](https://github.com/ai-driven-dev/aidd-cli/commit/77188eeca8df776d8cf6eaf64730b92f203162ad))
* **auth:** add auth login/logout/status command and use-cases ([2a70557](https://github.com/ai-driven-dev/aidd-cli/commit/2a70557bdfce78f30517d41ee84a9f70520d2b85))
* **auth:** add AuthConfig, AuthStorage, AuthReader and GhCliAdapter ([d3d13cc](https://github.com/ai-driven-dev/aidd-cli/commit/d3d13ccafb679b2d0afeaa3f9e42c1f67fc10d09)), closes [#54](https://github.com/ai-driven-dev/aidd-cli/issues/54)
* **auth:** wire AuthReader into all commands and remove --token flag ([fd598d6](https://github.com/ai-driven-dev/aidd-cli/commit/fd598d6f0f3415f8aea5dce6e57de06308e3cee8))
* **catalog:** add catalog generation use case ([3949d88](https://github.com/ai-driven-dev/aidd-cli/commit/3949d88964a2263afded5e78373a7f9882f3a3bd))
* **cli:** add update, restore, sync, cache, config and doctor-fix commands ([095c311](https://github.com/ai-driven-dev/aidd-cli/commit/095c311eca47086619485ac9ee58cd901dfe7117))
* **cli:** rename --framework to --path and clarify framework source ([929f421](https://github.com/ai-driven-dev/aidd-cli/commit/929f4216be475b291aff94560e4de5c2e1ac460c))
* **cli:** show contextual update banner on all commands ([6f8b5da](https://github.com/ai-driven-dev/aidd-cli/commit/6f8b5da984d5796ca1f5689e62c9ec09c1f52627))
* display ASCII banner when aidd is run without arguments ([d3b7f24](https://github.com/ai-driven-dev/aidd-cli/commit/d3b7f24dfed2900ccbb5aa6cea40c32ad7962d02))
* initial migration of AIDD CLI from monorepo ([1c67878](https://github.com/ai-driven-dev/aidd-cli/commit/1c67878402e3de17673e8ce3d0c0153c95e7aaa7))
* **interactive:** add interactive menus for CLI commands ([89c91e8](https://github.com/ai-driven-dev/aidd-cli/commit/89c91e85f210e8945bd957c0fe8b25876e95060c))
* **interactive:** add interactive menus for setup, install, and update commands ([ef8de5e](https://github.com/ai-driven-dev/aidd-cli/commit/ef8de5e06b7e6f57c63a073e3b5e583e1245aab7)), closes [#13](https://github.com/ai-driven-dev/aidd-cli/issues/13)
* **m0:** migrate to 4-layer clean architecture skeleton ([2648039](https://github.com/ai-driven-dev/aidd-cli/commit/2648039c6ec51a92330d8fe81ec64444a0981cb3))
* **m1:** implement domain layer (tickets 010–016) ([25a376c](https://github.com/ai-driven-dev/aidd-cli/commit/25a376cf04e660db26da1cd08926ccc4a013d701))
* **m2:** implement infrastructure layer — HTTP, tar, cache, adapters ([ec862dc](https://github.com/ai-driven-dev/aidd-cli/commit/ec862dccbcc6a0570be0d4bd2699c71e0a1a9ee4))
* **m3:** implement init & install commands — CLI entry point, use cases, E2E tests ([5f89025](https://github.com/ai-driven-dev/aidd-cli/commit/5f89025e957ff92be3cd88b68564898beda2ba6f))
* **m4:** add clean, doctor, status, and uninstall commands and use cases ([bfd3a4f](https://github.com/ai-driven-dev/aidd-cli/commit/bfd3a4f0f47f50b825e1d5a8869da42268392a3c))
* **manifest:** add isFileTracked() to detect if a path is owned by AIDD ([1a0b5c2](https://github.com/ai-driven-dev/aidd-cli/commit/1a0b5c22d8735f833b6a58679ae42da43124b489))
* **mcp:** add platform-aware MCP config transform for win32 ([13e9c91](https://github.com/ai-driven-dev/aidd-cli/commit/13e9c919dd05ab9242d502734bb032b18a579be5)), closes [#19](https://github.com/ai-driven-dev/aidd-cli/issues/19)
* **mcp:** platform-aware MCP config transform for Windows ([bb70aa3](https://github.com/ai-driven-dev/aidd-cli/commit/bb70aa336e60987cb8ca065726451f497223f551))
* **memory:** install update_memory script and git hook on install/update ([0bdc869](https://github.com/ai-driven-dev/aidd-cli/commit/0bdc869984ecb5984f8214f20cf7eb07974d1155))
* **memory:** install update_memory script and git hook on install/update ([4b47c39](https://github.com/ai-driven-dev/aidd-cli/commit/4b47c39f51665c699b9a0a83fad9f6f3d259aed1))
* merge ascii banner from worktree ([0170bee](https://github.com/ai-driven-dev/aidd-cli/commit/0170bee3cf9ca669be83a6ae8137431706c48d5e))
* monochrome color scheme + move label below logo + add DEC-005/006 ([f77e7a7](https://github.com/ai-driven-dev/aidd-cli/commit/f77e7a793bad9064c43f5b5e097252e2722ea9ea))
* **opencode:** detect and use existing opencode.jsonc config file ([f8e4216](https://github.com/ai-driven-dev/aidd-cli/commit/f8e4216e87402def0434377715fa760ad2520bd5))
* **opencode:** detect and use existing opencode.jsonc config file ([5c58a4d](https://github.com/ai-driven-dev/aidd-cli/commit/5c58a4d62e14f2e919292cac17e552ef924a1b16))
* **opencode:** use ConfigConflictError and named handler object for config() ([b732f65](https://github.com/ai-driven-dev/aidd-cli/commit/b732f650a1732b85befc62b6cc44a7ec53d052f8))
* **pkg:** publish under @ai-driven-dev/cli ([0b082a4](https://github.com/ai-driven-dev/aidd-cli/commit/0b082a4d669a93e7dd1f3a31c8a2be4e919d8dda))
* relaunch as v2 — full architecture rewrite (M0–M5) ([5563d66](https://github.com/ai-driven-dev/aidd-cli/commit/5563d669a6c3f8cde993957f23046c28deb89fc8))
* restrict banner to no-args and --help only ([c267438](https://github.com/ai-driven-dev/aidd-cli/commit/c26743874c5c76470f77cd0e30c72cf05ac5705c))
* reveal title and info box line by line after logo animation ([10fb354](https://github.com/ai-driven-dev/aidd-cli/commit/10fb354581e0edddc9d4bb2c705a11c16983c10a))
* **rules:** add and refine coding rules across all categories ([38c6f9a](https://github.com/ai-driven-dev/aidd-cli/commit/38c6f9aec3de5e5c0c64430980dd4b543fba432a))
* show animated banner on every interactive TTY session ([9508c08](https://github.com/ai-driven-dev/aidd-cli/commit/9508c083b476294d92029b185d8597c5af899251))
* skip banner pause on any keypress ([2abd2ec](https://github.com/ai-driven-dev/aidd-cli/commit/2abd2eccaaaa059c549751caf529a51341d523ce))
* **sync:** add docs distribution and cross-tool bidirectional format conversion ([2f04dba](https://github.com/ai-driven-dev/aidd-cli/commit/2f04dba5e3c0bca4b0610aa2d5233d063c44eaba))
* **tools:** aidd-branded commands namespacing and frontmatter-based init signals ([#49](https://github.com/ai-driven-dev/aidd-cli/issues/49)) ([19ea07e](https://github.com/ai-driven-dev/aidd-cli/commit/19ea07eb7dfd233bbf476e72d412afcf4e0bd56e))
* wrap logo in corner frame, info box below (Copilot-style layout) ([1743a90](https://github.com/ai-driven-dev/aidd-cli/commit/1743a900b367e89b1270f2ac33fbaa2641db540c))


### Bug Fixes

* **adopt:** introduce --from option replacing --release/--framework args ([ddcf8bf](https://github.com/ai-driven-dev/aidd-cli/commit/ddcf8bf9814c62f8db79cdd5442e41c900986a3d))
* **auth:** detect outdated gh CLI and suggest upgrade ([a69d39b](https://github.com/ai-driven-dev/aidd-cli/commit/a69d39baa07623ef13cc6c64eeb2c7f68f457fed))
* **auth:** prompt for token in interactive login when --token not provided ([ba271e8](https://github.com/ai-driven-dev/aidd-cli/commit/ba271e8932790dfb8f2cf052f8dbf5e5f1faf2a5))
* **auth:** remove speculative version number from outdated gh error message ([72c9c87](https://github.com/ai-driven-dev/aidd-cli/commit/72c9c87684909cd511725a77b5458a1981f92360))
* **auth:** surface real gh auth token errors instead of generic message ([ee42ab6](https://github.com/ai-driven-dev/aidd-cli/commit/ee42ab62033b6db9f216e0d754c587c7fd4084c5)), closes [#25](https://github.com/ai-driven-dev/aidd-cli/issues/25)
* **check-update:** suppress CLI banner on self-update and log failures in verbose ([e9cf288](https://github.com/ai-driven-dev/aidd-cli/commit/e9cf288adb760d1fd3abd531910395c5eac06e66))
* **check-update:** suppress CLI banner on self-update and log failures in verbose mode ([ce4099a](https://github.com/ai-driven-dev/aidd-cli/commit/ce4099ada6902e0977d398bf3f4088e113032911))
* **ci:** exclude package.json from biome formatter to avoid release-please conflicts ([0435abd](https://github.com/ai-driven-dev/aidd-cli/commit/0435abdc60b7a84bb0617779c24cc7c5f764677a))
* **ci:** remove component prefix from release tags ([b50f334](https://github.com/ai-driven-dev/aidd-cli/commit/b50f3348c8486def25db1a605f893058c130854f))
* **ci:** remove duplicate pnpm version in release workflow ([ed79154](https://github.com/ai-driven-dev/aidd-cli/commit/ed79154e68a610661b75c7f4dc1f156a5682b53c))
* **clean:** add interactive confirmation instead of requiring --force ([8c3d370](https://github.com/ai-driven-dev/aidd-cli/commit/8c3d3703ac637d50833212ef53b395fbda5e3bd0))
* **cli:** make self-update PM-agnostic and notify on CLI version outdated ([1984a54](https://github.com/ai-driven-dev/aidd-cli/commit/1984a54778e7778dff3f87ccd3476dd3d7c8116c))
* **cli:** mention correct recovery commands in init re-init error ([0e56255](https://github.com/ai-driven-dev/aidd-cli/commit/0e5625507c8ac69200c6890ee360ae2e648165e8))
* **cli:** surface actionable recovery path when AIDD files exist without manifest ([6a3fa9e](https://github.com/ai-driven-dev/aidd-cli/commit/6a3fa9ee431079d59387c644871f9c4ae738628d)), closes [#41](https://github.com/ai-driven-dev/aidd-cli/issues/41)
* **cli:** surface actionable recovery when AIDD files exist without manifest ([#41](https://github.com/ai-driven-dev/aidd-cli/issues/41)) ([a4f43e0](https://github.com/ai-driven-dev/aidd-cli/commit/a4f43e09fca85fca21b77ed303e7ad2ebadb2738))
* **distribution:** preserve description in rules with alwaysApply false ([657499a](https://github.com/ai-driven-dev/aidd-cli/commit/657499ae6841ac70776025a6aa9db4f94cd46e77))
* **doctor:** replace directory existence check with aidd signal detection ([64ab8ab](https://github.com/ai-driven-dev/aidd-cli/commit/64ab8ab3bf9749e6adb5153c4106fa42527963be))
* **doctor:** signal-based orphan detection + biome scope fix ([85f30d0](https://github.com/ai-driven-dev/aidd-cli/commit/85f30d0b64af9a0ca50bae4cd253729a8ac4fb0b))
* **install:** ensure .gitignore is updated on install and update ([b4762ea](https://github.com/ai-driven-dev/aidd-cli/commit/b4762eabf2ed4ecc239c343d714a11cc7b5a633a))
* **install:** skip pre-existing user files to prevent silent overwrite ([88604fa](https://github.com/ai-driven-dev/aidd-cli/commit/88604fae32f4773e271e64c715833df0d59a7525))
* **lint:** fix Biome v2 worktree path exclusion and unused imports ([9e88227](https://github.com/ai-driven-dev/aidd-cli/commit/9e8822706bfaac5efa9cd8f29a68451e672c98bb))
* **loader:** filter AppleDouble ._* files from framework content ([d094d31](https://github.com/ai-driven-dev/aidd-cli/commit/d094d3117c090bb91bf07a8bc434664cebb25f5f))
* **loader:** filter AppleDouble ._* files from framework content ([024736d](https://github.com/ai-driven-dev/aidd-cli/commit/024736d9ba5499394d9e79cb3205627e6db57351)), closes [#86](https://github.com/ai-driven-dev/aidd-cli/issues/86)
* **opencode:** align CONFIG_REFS path with framework convention ([23673c7](https://github.com/ai-driven-dev/aidd-cli/commit/23673c73c07864ccb2717a45c28030efe0604ac7))
* **opencode:** normalize command cross-references to installed AIDD path ([fd69e3e](https://github.com/ai-driven-dev/aidd-cli/commit/fd69e3ee0c9eff4bef0c656ba6944c00caf95532))
* **opencode:** normalize command cross-references to installed AIDD path ([fd4d87d](https://github.com/ai-driven-dev/aidd-cli/commit/fd4d87dbdc8b483e8bc9586b4cb13a01b91f0e6c))
* **opencode:** opencode.json missing instructions field ([cd6bbac](https://github.com/ai-driven-dev/aidd-cli/commit/cd6bbac6b737463b91163d92d255bfe5bf8e100b))
* **opencode:** use remote type instead of sse for url-based MCP servers ([#34](https://github.com/ai-driven-dev/aidd-cli/issues/34)) ([5e4d97c](https://github.com/ai-driven-dev/aidd-cli/commit/5e4d97c4577c6a2e9d97dd81418abc579b8d2700))
* prevent silent overwrite of user files during install and update ([10270dd](https://github.com/ai-driven-dev/aidd-cli/commit/10270dd455178ab45440b4a187c0bbb3c5257516))
* remove malicious payload ([b1799be](https://github.com/ai-driven-dev/aidd-cli/commit/b1799befa76251ea30fd3edcb08b196be880b468))
* replace cross-repo relative links with full GitHub URLs ([10b18cd](https://github.com/ai-driven-dev/aidd-cli/commit/10b18cd05d8ff2341dc46b6871de70598a43d1e2))
* **resolver:** surface HTTP cause and auth hint on tag lookup failure ([c069d13](https://github.com/ai-driven-dev/aidd-cli/commit/c069d135668f3d35cee182ac621962a56150e647))
* **resolver:** surface HTTP cause and auth hint on tag lookup failure ([28bf567](https://github.com/ai-driven-dev/aidd-cli/commit/28bf567961dbe7a01eecf016358eea914c627c92)), closes [#25](https://github.com/ai-driven-dev/aidd-cli/issues/25)
* restore CONTRIBUTING.md removed during repo migration ([30b0e7e](https://github.com/ai-driven-dev/aidd-cli/commit/30b0e7e5f462fd89120b5e0608e492ebecf3b7b5))
* **restore:** allow non-interactive restore of deleted files without --force ([da3be6b](https://github.com/ai-driven-dev/aidd-cli/commit/da3be6b44011ecbb1787c134759d0d0d71f41ceb))
* **restore:** auto-restore deleted files without prompting for conflict ([98ac4e0](https://github.com/ai-driven-dev/aidd-cli/commit/98ac4e03745350404b731a177c41568abb79c8df))
* **scripts:** rename update_memory.mjs to update_memory.js ([5315d77](https://github.com/ai-driven-dev/aidd-cli/commit/5315d777ee3add52250ead67e25e602a0133fa51))
* **scripts:** rename update_memory.mjs to update_memory.js in framework-v2 fixture ([a7b272a](https://github.com/ai-driven-dev/aidd-cli/commit/a7b272a4697ad76297f257a90bad88dacdece1bc))
* **scripts:** update remaining .mjs references to .js in tests ([1015b31](https://github.com/ai-driven-dev/aidd-cli/commit/1015b3195470af4227a42830e0c4d2c002cff342))
* **setup:** pass repo to fetchLatestVersion so release default is correct ([dd9c68d](https://github.com/ai-driven-dev/aidd-cli/commit/dd9c68d45cfb007a1dcdabea40aa212accaa1eee))
* **setup:** show version prompt and support local path in needs-init flow ([305c785](https://github.com/ai-driven-dev/aidd-cli/commit/305c785928c6b18b99d6dbc64746ac852fa297c9))
* **sync:** exit gracefully when no tools have local modifications in interactive mode ([684e4b7](https://github.com/ai-driven-dev/aidd-cli/commit/684e4b74fd75ab02d589a2b239f321b6d6ef32a8))
* **tools:** emit mode:subagent in opencode agent frontmatter ([5bec7b3](https://github.com/ai-driven-dev/aidd-cli/commit/5bec7b3e4a6303400e4cf977fa8b6ccdadb796b4))
* update README to indicate CLI is outdated and improve formatting ([e90c180](https://github.com/ai-driven-dev/aidd-cli/commit/e90c18040b029b983ef72ef8eb5d10a32b9b278a))
* **update:** bump manifest version when content unchanged in interactive mode ([4a29622](https://github.com/ai-driven-dev/aidd-cli/commit/4a296223664c476a6edc062f4cda1ac927317513))
* **update:** prevent stale merge-file hash in manifest after update ([270dbb3](https://github.com/ai-driven-dev/aidd-cli/commit/270dbb3bc8ac5b40602f2c4554fe9370233132b9))
* **update:** prompt when framework removes a user-modified file ([43b5472](https://github.com/ai-driven-dev/aidd-cli/commit/43b54727719585994d102b019bb14d918b05deb4))
* **update:** simplify update banner to always suggest aidd update ([2c27912](https://github.com/ai-driven-dev/aidd-cli/commit/2c27912b6008a7614e02e18d76c14640d1f4f1d1))
* **update:** skip pre-existing user files when framework introduces new file ([7cfb08c](https://github.com/ai-driven-dev/aidd-cli/commit/7cfb08c8932fd87b1cb98ed941e64f94d80c8608))


### Performance

* **tests:** parallelize e2e tests within files to halve total runtime ([48a0fad](https://github.com/ai-driven-dev/aidd-cli/commit/48a0fadca6afc070021fa12fa8a0c47f53419643))


### Documentation

* add AIDD greenfield documentation and tooling setup ([ed08fc5](https://github.com/ai-driven-dev/aidd-cli/commit/ed08fc51e3d91c4a0569edf85a6e464375699bb7))
* **adr:** add DEC-001 framework config path convention ([ce758b8](https://github.com/ai-driven-dev/aidd-cli/commit/ce758b87b30ebd7014126180aa42d1e2974160c6))
* **adr:** add DEC-012 and no-tool-logic rule in use cases ([0274c90](https://github.com/ai-driven-dev/aidd-cli/commit/0274c903697e8e0aad36b56b34102f936b800d2e))
* **adr:** record decisions for doctor signal detection ([46bb981](https://github.com/ai-driven-dev/aidd-cli/commit/46bb9815cf40cddfc8af9635dedb3db59b1f9ea8))
* **auth:** update README and memory bank for auth feature ([61e19bd](https://github.com/ai-driven-dev/aidd-cli/commit/61e19bd9d352f16bda0a985c337ca8b848d2efad))
* clarify read:packages scope required for GitHub Packages install ([7c6643c](https://github.com/ai-driven-dev/aidd-cli/commit/7c6643cf9b49b8a96ff6194d3cde6f60a55ca741))
* improve manual testing scenarios in CONTRIBUTING.md ([9339bcb](https://github.com/ai-driven-dev/aidd-cli/commit/9339bcb77a467febe671889bc644abf96856747d))
* improve manual testing scenarios in CONTRIBUTING.md ([f2d6db1](https://github.com/ai-driven-dev/aidd-cli/commit/f2d6db12b0875cfb13ceeaa143c1e6bbe1e14451)), closes [#12](https://github.com/ai-driven-dev/aidd-cli/issues/12)
* initialize memory bank ([2134eac](https://github.com/ai-driven-dev/aidd-cli/commit/2134eac87ae7612bec87c752b04a6d9685a44eb6))
* **memory:** add opencode tool and update version to v2.7.3 ([97b4671](https://github.com/ai-driven-dev/aidd-cli/commit/97b4671fa6c50111f30556348942948efc62ef52))
* **memory:** document check-update utility and update banner behavior ([7e027df](https://github.com/ai-driven-dev/aidd-cli/commit/7e027df4a45ef8cc00c6b15db8d68868cb1ed483))
* **memory:** update architecture, testing, codebase map, and project docs ([25b82a4](https://github.com/ai-driven-dev/aidd-cli/commit/25b82a44afded567603127359b96daac057f0a7f))
* **memory:** update memory documentation to reflect current behavior ([bdac76b](https://github.com/ai-driven-dev/aidd-cli/commit/bdac76bc395f115710499adb659c59ed42dc3a4f))
* **memory:** update package version and test count in documentation ([4e79dec](https://github.com/ai-driven-dev/aidd-cli/commit/4e79dece8727b76c687d736ec51744d8f426f494))
* **readme:** add GitHub Packages install method with .npmrc and token instructions ([2df982c](https://github.com/ai-driven-dev/aidd-cli/commit/2df982c681a907dbda55dc564bde06546b29d5fc))
* **readme:** clarify AIDD_TOKEN requires repo scope not read:packages ([327b91d](https://github.com/ai-driven-dev/aidd-cli/commit/327b91d36564f90030d5babd56d90d0047032830))
* **readme:** remove GitHub Packages install method, keep public npm only ([ada7852](https://github.com/ai-driven-dev/aidd-cli/commit/ada78529d57bd0b47eb814a228da0693f236863f))
* **readme:** remove init and adopt references (commands no longer available) ([9b6b7b0](https://github.com/ai-driven-dev/aidd-cli/commit/9b6b7b0ef251848d0fdffee784e8e0314fec3ac8))
* record DEC-007/008 and update memory for user file protection ([2f017de](https://github.com/ai-driven-dev/aidd-cli/commit/2f017ded413124aec8e46e7647ccf1fad57030a9))
* remove manual TOC in favor of GitHub native TOC ([5929cfb](https://github.com/ai-driven-dev/aidd-cli/commit/5929cfb0089bf8f5a20a55b6aee326e750dd96ee))
* restructure README and rewrite CONTRIBUTING ([37fec2b](https://github.com/ai-driven-dev/aidd-cli/commit/37fec2bee0b2aebc48911fa38c09e1c8a516d1f2))
* restructure README for first-time user clarity ([4eec873](https://github.com/ai-driven-dev/aidd-cli/commit/4eec87368ab30ed96c39398279509fe4b3017965))
* **tasks:** add implementation plan for MCP platform adaptation ([5777685](https://github.com/ai-driven-dev/aidd-cli/commit/57776856d77cec36db70e79875feef0da3bf6d41))
* update CONTRIBUTING and README ([b9043b4](https://github.com/ai-driven-dev/aidd-cli/commit/b9043b48bc24ae968b425569eff36661f4e51665))
* update memory, backlog and task files for M6-M9 ([1d7444e](https://github.com/ai-driven-dev/aidd-cli/commit/1d7444ec1b41a6c11b8596b6bda73881dc601b50))
* update README and memory for v2.10.0 ([ef07cc8](https://github.com/ai-driven-dev/aidd-cli/commit/ef07cc8bc53f6893c3ca0fe0dcaa78eabd3136da))
* update README, CONTRIBUTING and memory for M9 milestone ([f77c5be](https://github.com/ai-driven-dev/aidd-cli/commit/f77c5be96c7b236f041b2316b26963299157027b))
* **ux:** align ux_copy.md with actual message implementation ([9e385cb](https://github.com/ai-driven-dev/aidd-cli/commit/9e385cb11e64c3c7a21674050098ce19f723dbd3))


### Refactoring

* **app:** update init, install, output, and CLI entry point ([3bb5426](https://github.com/ai-driven-dev/aidd-cli/commit/3bb54265e2688dc303933faee2346e9dc840e15c))
* **cli:** remove init and adopt commands, add programmatic test helpers ([#95](https://github.com/ai-driven-dev/aidd-cli/issues/95)) ([4204dfb](https://github.com/ai-driven-dev/aidd-cli/commit/4204dfb72bdb22cae609d71a141d5852c108a67a))
* **commands:** extract parseGlobalOptions helper, deduplicate tool-config ([8609851](https://github.com/ai-driven-dev/aidd-cli/commit/8609851d4635c5ff542be75e9e973dfe7a382a47))
* **commands:** push orchestration into use-cases, one use-case per command ([73b53cd](https://github.com/ai-driven-dev/aidd-cli/commit/73b53cd33ae70efcd199942c5b8b1d19a3536d5e))
* **commands:** strip business logic from command handlers ([d97f3c9](https://github.com/ai-driven-dev/aidd-cli/commit/d97f3c9296020136c243c693ce6525b9a47d7a11))
* **distribution:** inject Platform port, delegate transform ownership to domain models ([302d35b](https://github.com/ai-driven-dev/aidd-cli/commit/302d35b5c2f7a577181201994b1afa00cd001868))
* **domain:** clean models, ports, and tool configs ([a1faa72](https://github.com/ai-driven-dev/aidd-cli/commit/a1faa72920815c82955e3028a89149d9a772aa96))
* extract banner into BannerUseCase with inject WriteStream ([bea0826](https://github.com/ai-driven-dev/aidd-cli/commit/bea082630d2f48f217d7556457d6f1b74dfbdd8e))
* **infra:** remove premature manifest migration system ([6c6838f](https://github.com/ai-driven-dev/aidd-cli/commit/6c6838fba2c462bc61a674fa5ded016fab5f57e6))
* **infra:** remove premature manifest migration system ([b68a4a0](https://github.com/ai-driven-dev/aidd-cli/commit/b68a4a0bc3fb0d5973b0eed473816a1e7f24b40d))
* **infra:** update adapters, remove logger-adapter, add migrations ([397e98c](https://github.com/ai-driven-dev/aidd-cli/commit/397e98c5bdb2b2ea4893c129350dcd4079b0640c))
* **m1:** clean architecture pass 2 — S1-S6 smells removed ([294c597](https://github.com/ai-driven-dev/aidd-cli/commit/294c597250bf677965e2191eb49200d4b66cf6a0))
* **m1:** clean architecture pass 3 — U1-U5 smells removed ([a2ea4fa](https://github.com/ai-driven-dev/aidd-cli/commit/a2ea4fa1cef6ffdddd69de335692fae1d2ffe455))
* **m1:** clean architecture pass 4 — W1-W4 smells removed ([2c4addc](https://github.com/ai-driven-dev/aidd-cli/commit/2c4addcd36e5205b5719aa5f71a0496d355bc375))
* **m1:** clean architecture R1-R4 — remove smells, move ToolId ([d828e06](https://github.com/ai-driven-dev/aidd-cli/commit/d828e060657da13e1ab383f1fc10c7bb085a678b))
* **m1:** simplify domain model — remove organizationType and defer reverse ops to M7 ([b9bc628](https://github.com/ai-driven-dev/aidd-cli/commit/b9bc6286f5f22ccc643696d00a586f132aee0c43))
* **setup:** add non-interactive options to SetupUseCase ([#97](https://github.com/ai-driven-dev/aidd-cli/issues/97)) ([e97129a](https://github.com/ai-driven-dev/aidd-cli/commit/e97129afc55108b09b9d4bac8929e7f240755610))
* **setup:** extract private method per switch case ([df2ce4b](https://github.com/ai-driven-dev/aidd-cli/commit/df2ce4ba5960777af150a455fee8c78fb6a052d0))
* **setup:** merge setup-flow into setup-use-case ([6554926](https://github.com/ai-driven-dev/aidd-cli/commit/6554926e4b1f2844def37ae5ab59d84bd937a01b))
* simplify architecture — M3/M4/M5 implementation ([37aa9d8](https://github.com/ai-driven-dev/aidd-cli/commit/37aa9d8ffd5ec89b88a1deef7729fd58afb63625))
* **sync:** remove framework loading — use manifest frameworkPath as canonical key ([6bba237](https://github.com/ai-driven-dev/aidd-cli/commit/6bba2373feab15e38a96358a0378a0909e5b7a16))
* **test:** rename tests to functional behavioral descriptions ([282aea5](https://github.com/ai-driven-dev/aidd-cli/commit/282aea504f4db9dee5132c585cfac12944c63005))
* **use-cases:** convert writeCatalog function to CatalogUseCase class ([18fd0de](https://github.com/ai-driven-dev/aidd-cli/commit/18fd0de4cca288d9db0d73d68e63d75c060a383f))
* **ux:** normalize user-facing messages across all CLI commands ([4e73132](https://github.com/ai-driven-dev/aidd-cli/commit/4e7313242be6bec2f95a4162c7c48a404ced48cb))
* **ux:** normalize user-facing messages across all CLI commands ([cc1cb34](https://github.com/ai-driven-dev/aidd-cli/commit/cc1cb34e05b0da641d79ba3b3e3d0e7832ba370a))

## [2.13.4](https://github.com/ai-driven-dev/aidd-cli/compare/v2.13.3...v2.13.4) (2026-03-24)


### Refactoring

* **cli:** remove init and adopt commands, add programmatic test helpers ([#95](https://github.com/ai-driven-dev/aidd-cli/issues/95)) ([4204dfb](https://github.com/ai-driven-dev/aidd-cli/commit/4204dfb72bdb22cae609d71a141d5852c108a67a))
* **setup:** add non-interactive options to SetupUseCase ([#97](https://github.com/ai-driven-dev/aidd-cli/issues/97)) ([e97129a](https://github.com/ai-driven-dev/aidd-cli/commit/e97129afc55108b09b9d4bac8929e7f240755610))

## [2.13.3](https://github.com/ai-driven-dev/aidd-cli/compare/v2.13.2...v2.13.3) (2026-03-23)


### Bug Fixes

* **loader:** filter AppleDouble ._* files from framework content ([d094d31](https://github.com/ai-driven-dev/aidd-cli/commit/d094d3117c090bb91bf07a8bc434664cebb25f5f))
* **loader:** filter AppleDouble ._* files from framework content ([024736d](https://github.com/ai-driven-dev/aidd-cli/commit/024736d9ba5499394d9e79cb3205627e6db57351)), closes [#86](https://github.com/ai-driven-dev/aidd-cli/issues/86)


### Documentation

* **readme:** add GitHub Packages install method with .npmrc and token instructions ([2df982c](https://github.com/ai-driven-dev/aidd-cli/commit/2df982c681a907dbda55dc564bde06546b29d5fc))
* **readme:** remove GitHub Packages install method, keep public npm only ([ada7852](https://github.com/ai-driven-dev/aidd-cli/commit/ada78529d57bd0b47eb814a228da0693f236863f))
* **readme:** remove init and adopt references (commands no longer available) ([9b6b7b0](https://github.com/ai-driven-dev/aidd-cli/commit/9b6b7b0ef251848d0fdffee784e8e0314fec3ac8))

## [2.13.2](https://github.com/ai-driven-dev/aidd-cli/compare/v2.13.1...v2.13.2) (2026-03-23)


### Bug Fixes

* **auth:** detect outdated gh CLI and suggest upgrade ([a69d39b](https://github.com/ai-driven-dev/aidd-cli/commit/a69d39baa07623ef13cc6c64eeb2c7f68f457fed))
* **auth:** remove speculative version number from outdated gh error message ([72c9c87](https://github.com/ai-driven-dev/aidd-cli/commit/72c9c87684909cd511725a77b5458a1981f92360))
* **auth:** surface real gh auth token errors instead of generic message ([ee42ab6](https://github.com/ai-driven-dev/aidd-cli/commit/ee42ab62033b6db9f216e0d754c587c7fd4084c5)), closes [#25](https://github.com/ai-driven-dev/aidd-cli/issues/25)
* **distribution:** preserve description in rules with alwaysApply false ([657499a](https://github.com/ai-driven-dev/aidd-cli/commit/657499ae6841ac70776025a6aa9db4f94cd46e77))
* **scripts:** rename update_memory.mjs to update_memory.js ([5315d77](https://github.com/ai-driven-dev/aidd-cli/commit/5315d777ee3add52250ead67e25e602a0133fa51))
* **scripts:** rename update_memory.mjs to update_memory.js in framework-v2 fixture ([a7b272a](https://github.com/ai-driven-dev/aidd-cli/commit/a7b272a4697ad76297f257a90bad88dacdece1bc))
* **scripts:** update remaining .mjs references to .js in tests ([1015b31](https://github.com/ai-driven-dev/aidd-cli/commit/1015b3195470af4227a42830e0c4d2c002cff342))

## [2.13.1](https://github.com/ai-driven-dev/aidd-cli/compare/v2.13.0...v2.13.1) (2026-03-23)


### Bug Fixes

* **auth:** detect outdated gh CLI and suggest upgrade ([a69d39b](https://github.com/ai-driven-dev/aidd-cli/commit/a69d39baa07623ef13cc6c64eeb2c7f68f457fed))
* **auth:** remove speculative version number from outdated gh error message ([72c9c87](https://github.com/ai-driven-dev/aidd-cli/commit/72c9c87684909cd511725a77b5458a1981f92360))
* **auth:** surface real gh auth token errors instead of generic message ([ee42ab6](https://github.com/ai-driven-dev/aidd-cli/commit/ee42ab62033b6db9f216e0d754c587c7fd4084c5)), closes [#25](https://github.com/ai-driven-dev/aidd-cli/issues/25)

## [2.13.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.12.0...v2.13.0) (2026-03-22)


### Features

* **manifest:** add isFileTracked() to detect if a path is owned by AIDD ([1a0b5c2](https://github.com/ai-driven-dev/aidd-cli/commit/1a0b5c22d8735f833b6a58679ae42da43124b489))


### Bug Fixes

* **install:** skip pre-existing user files to prevent silent overwrite ([88604fa](https://github.com/ai-driven-dev/aidd-cli/commit/88604fae32f4773e271e64c715833df0d59a7525))
* prevent silent overwrite of user files during install and update ([10270dd](https://github.com/ai-driven-dev/aidd-cli/commit/10270dd455178ab45440b4a187c0bbb3c5257516))
* **update:** skip pre-existing user files when framework introduces new file ([7cfb08c](https://github.com/ai-driven-dev/aidd-cli/commit/7cfb08c8932fd87b1cb98ed941e64f94d80c8608))


### Documentation

* record DEC-007/008 and update memory for user file protection ([2f017de](https://github.com/ai-driven-dev/aidd-cli/commit/2f017ded413124aec8e46e7647ccf1fad57030a9))

## [2.12.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.11.0...v2.12.0) (2026-03-22)


### Features

* add 1.5s pause after banner to let user read it ([98ce223](https://github.com/ai-driven-dev/aidd-cli/commit/98ce2231b9147a6f7d3550a3e275abe3d6dc4444))
* add AI-Driven Dev label above logo in corner frame ([31bf641](https://github.com/ai-driven-dev/aidd-cli/commit/31bf641e4e9351347bceee2bcf1539025aa9a5f4))
* animated ANSI banner with glitch effect on CLI launch ([2f6f43e](https://github.com/ai-driven-dev/aidd-cli/commit/2f6f43e2c34d78b2f84275966fb0f942070da6ac))
* animated ANSI banner with glitch effect on CLI launch ([#64](https://github.com/ai-driven-dev/aidd-cli/issues/64)) ([9b62bb6](https://github.com/ai-driven-dev/aidd-cli/commit/9b62bb62b02f323da3463705fa1c9241b0797152))
* any keypress skips the entire banner animation ([3ec92cd](https://github.com/ai-driven-dev/aidd-cli/commit/3ec92cdc53a3f668174be9a18078bf55748d0692))
* **auth:** add aidd auth login/logout/status and centralize token resolution ([77188ee](https://github.com/ai-driven-dev/aidd-cli/commit/77188eeca8df776d8cf6eaf64730b92f203162ad))
* **auth:** add auth login/logout/status command and use-cases ([2a70557](https://github.com/ai-driven-dev/aidd-cli/commit/2a70557bdfce78f30517d41ee84a9f70520d2b85))
* **auth:** add AuthConfig, AuthStorage, AuthReader and GhCliAdapter ([d3d13cc](https://github.com/ai-driven-dev/aidd-cli/commit/d3d13ccafb679b2d0afeaa3f9e42c1f67fc10d09)), closes [#54](https://github.com/ai-driven-dev/aidd-cli/issues/54)
* **auth:** wire AuthReader into all commands and remove --token flag ([fd598d6](https://github.com/ai-driven-dev/aidd-cli/commit/fd598d6f0f3415f8aea5dce6e57de06308e3cee8))
* **cli:** rename --framework to --path and clarify framework source ([929f421](https://github.com/ai-driven-dev/aidd-cli/commit/929f4216be475b291aff94560e4de5c2e1ac460c))
* **interactive:** add interactive menus for CLI commands ([89c91e8](https://github.com/ai-driven-dev/aidd-cli/commit/89c91e85f210e8945bd957c0fe8b25876e95060c))
* **interactive:** add interactive menus for setup, install, and update commands ([ef8de5e](https://github.com/ai-driven-dev/aidd-cli/commit/ef8de5e06b7e6f57c63a073e3b5e583e1245aab7)), closes [#13](https://github.com/ai-driven-dev/aidd-cli/issues/13)
* monochrome color scheme + move label below logo + add DEC-005/006 ([f77e7a7](https://github.com/ai-driven-dev/aidd-cli/commit/f77e7a793bad9064c43f5b5e097252e2722ea9ea))
* restrict banner to no-args and --help only ([c267438](https://github.com/ai-driven-dev/aidd-cli/commit/c26743874c5c76470f77cd0e30c72cf05ac5705c))
* reveal title and info box line by line after logo animation ([10fb354](https://github.com/ai-driven-dev/aidd-cli/commit/10fb354581e0edddc9d4bb2c705a11c16983c10a))
* show animated banner on every interactive TTY session ([9508c08](https://github.com/ai-driven-dev/aidd-cli/commit/9508c083b476294d92029b185d8597c5af899251))
* skip banner pause on any keypress ([2abd2ec](https://github.com/ai-driven-dev/aidd-cli/commit/2abd2eccaaaa059c549751caf529a51341d523ce))
* wrap logo in corner frame, info box below (Copilot-style layout) ([1743a90](https://github.com/ai-driven-dev/aidd-cli/commit/1743a900b367e89b1270f2ac33fbaa2641db540c))


### Bug Fixes

* **auth:** prompt for token in interactive login when --token not provided ([ba271e8](https://github.com/ai-driven-dev/aidd-cli/commit/ba271e8932790dfb8f2cf052f8dbf5e5f1faf2a5))
* **clean:** add interactive confirmation instead of requiring --force ([8c3d370](https://github.com/ai-driven-dev/aidd-cli/commit/8c3d3703ac637d50833212ef53b395fbda5e3bd0))
* **install:** ensure .gitignore is updated on install and update ([b4762ea](https://github.com/ai-driven-dev/aidd-cli/commit/b4762eabf2ed4ecc239c343d714a11cc7b5a633a))
* **restore:** allow non-interactive restore of deleted files without --force ([da3be6b](https://github.com/ai-driven-dev/aidd-cli/commit/da3be6b44011ecbb1787c134759d0d0d71f41ceb))
* **restore:** auto-restore deleted files without prompting for conflict ([98ac4e0](https://github.com/ai-driven-dev/aidd-cli/commit/98ac4e03745350404b731a177c41568abb79c8df))
* **setup:** pass repo to fetchLatestVersion so release default is correct ([dd9c68d](https://github.com/ai-driven-dev/aidd-cli/commit/dd9c68d45cfb007a1dcdabea40aa212accaa1eee))
* **setup:** show version prompt and support local path in needs-init flow ([305c785](https://github.com/ai-driven-dev/aidd-cli/commit/305c785928c6b18b99d6dbc64746ac852fa297c9))
* **sync:** exit gracefully when no tools have local modifications in interactive mode ([684e4b7](https://github.com/ai-driven-dev/aidd-cli/commit/684e4b74fd75ab02d589a2b239f321b6d6ef32a8))
* **update:** bump manifest version when content unchanged in interactive mode ([4a29622](https://github.com/ai-driven-dev/aidd-cli/commit/4a296223664c476a6edc062f4cda1ac927317513))
* **update:** prompt when framework removes a user-modified file ([43b5472](https://github.com/ai-driven-dev/aidd-cli/commit/43b54727719585994d102b019bb14d918b05deb4))
* **update:** simplify update banner to always suggest aidd update ([2c27912](https://github.com/ai-driven-dev/aidd-cli/commit/2c27912b6008a7614e02e18d76c14640d1f4f1d1))


### Documentation

* **auth:** update README and memory bank for auth feature ([61e19bd](https://github.com/ai-driven-dev/aidd-cli/commit/61e19bd9d352f16bda0a985c337ca8b848d2efad))
* **ux:** align ux_copy.md with actual message implementation ([9e385cb](https://github.com/ai-driven-dev/aidd-cli/commit/9e385cb11e64c3c7a21674050098ce19f723dbd3))


### Refactoring

* **commands:** extract parseGlobalOptions helper, deduplicate tool-config ([8609851](https://github.com/ai-driven-dev/aidd-cli/commit/8609851d4635c5ff542be75e9e973dfe7a382a47))
* **commands:** push orchestration into use-cases, one use-case per command ([73b53cd](https://github.com/ai-driven-dev/aidd-cli/commit/73b53cd33ae70efcd199942c5b8b1d19a3536d5e))
* **commands:** strip business logic from command handlers ([d97f3c9](https://github.com/ai-driven-dev/aidd-cli/commit/d97f3c9296020136c243c693ce6525b9a47d7a11))
* extract banner into BannerUseCase with inject WriteStream ([bea0826](https://github.com/ai-driven-dev/aidd-cli/commit/bea082630d2f48f217d7556457d6f1b74dfbdd8e))
* **setup:** extract private method per switch case ([df2ce4b](https://github.com/ai-driven-dev/aidd-cli/commit/df2ce4ba5960777af150a455fee8c78fb6a052d0))
* **setup:** merge setup-flow into setup-use-case ([6554926](https://github.com/ai-driven-dev/aidd-cli/commit/6554926e4b1f2844def37ae5ab59d84bd937a01b))
* **ux:** normalize user-facing messages across all CLI commands ([4e73132](https://github.com/ai-driven-dev/aidd-cli/commit/4e7313242be6bec2f95a4162c7c48a404ced48cb))
* **ux:** normalize user-facing messages across all CLI commands ([cc1cb34](https://github.com/ai-driven-dev/aidd-cli/commit/cc1cb34e05b0da641d79ba3b3e3d0e7832ba370a))

## [2.11.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.10.2...v2.11.0) (2026-03-19)


### Features

* **memory:** install update_memory script and git hook on install/update ([0bdc869](https://github.com/ai-driven-dev/aidd-cli/commit/0bdc869984ecb5984f8214f20cf7eb07974d1155))


### Bug Fixes

* **opencode:** normalize command cross-references to installed AIDD path ([fd69e3e](https://github.com/ai-driven-dev/aidd-cli/commit/fd69e3ee0c9eff4bef0c656ba6944c00caf95532))
* **opencode:** normalize command cross-references to installed AIDD path ([fd4d87d](https://github.com/ai-driven-dev/aidd-cli/commit/fd4d87dbdc8b483e8bc9586b4cb13a01b91f0e6c))

## [2.10.2](https://github.com/ai-driven-dev/aidd-cli/compare/v2.10.1...v2.10.2) (2026-03-19)


### Bug Fixes

* **doctor:** replace directory existence check with aidd signal detection ([64ab8ab](https://github.com/ai-driven-dev/aidd-cli/commit/64ab8ab3bf9749e6adb5153c4106fa42527963be))
* **doctor:** signal-based orphan detection + biome scope fix ([85f30d0](https://github.com/ai-driven-dev/aidd-cli/commit/85f30d0b64af9a0ca50bae4cd253729a8ac4fb0b))


### Documentation

* **adr:** record decisions for doctor signal detection ([46bb981](https://github.com/ai-driven-dev/aidd-cli/commit/46bb9815cf40cddfc8af9635dedb3db59b1f9ea8))

## [2.10.1](https://github.com/ai-driven-dev/aidd-cli/compare/v2.10.0...v2.10.1) (2026-03-19)


### Bug Fixes

* **tools:** emit mode:subagent in opencode agent frontmatter ([5bec7b3](https://github.com/ai-driven-dev/aidd-cli/commit/5bec7b3e4a6303400e4cf977fa8b6ccdadb796b4))


### Documentation

* update README and memory for v2.10.0 ([ef07cc8](https://github.com/ai-driven-dev/aidd-cli/commit/ef07cc8bc53f6893c3ca0fe0dcaa78eabd3136da))

## [2.10.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.9.2...v2.10.0) (2026-03-18)


### Features

* **tools:** aidd-branded commands namespacing and frontmatter-based init signals ([#49](https://github.com/ai-driven-dev/aidd-cli/issues/49)) ([19ea07e](https://github.com/ai-driven-dev/aidd-cli/commit/19ea07eb7dfd233bbf476e72d412afcf4e0bd56e))

## [2.9.2](https://github.com/ai-driven-dev/aidd-cli/compare/v2.9.1...v2.9.2) (2026-03-18)


### Bug Fixes

* **opencode:** align CONFIG_REFS path with framework convention ([23673c7](https://github.com/ai-driven-dev/aidd-cli/commit/23673c73c07864ccb2717a45c28030efe0604ac7))
* **opencode:** opencode.json missing instructions field ([cd6bbac](https://github.com/ai-driven-dev/aidd-cli/commit/cd6bbac6b737463b91163d92d255bfe5bf8e100b))


### Documentation

* **adr:** add DEC-001 framework config path convention ([ce758b8](https://github.com/ai-driven-dev/aidd-cli/commit/ce758b87b30ebd7014126180aa42d1e2974160c6))

## [2.9.1](https://github.com/ai-driven-dev/aidd-cli/compare/v2.9.0...v2.9.1) (2026-03-17)


### Bug Fixes

* **check-update:** suppress CLI banner on self-update and log failures in verbose ([e9cf288](https://github.com/ai-driven-dev/aidd-cli/commit/e9cf288adb760d1fd3abd531910395c5eac06e66))
* **check-update:** suppress CLI banner on self-update and log failures in verbose mode ([ce4099a](https://github.com/ai-driven-dev/aidd-cli/commit/ce4099ada6902e0977d398bf3f4088e113032911))
* **cli:** surface actionable recovery when AIDD files exist without manifest ([#41](https://github.com/ai-driven-dev/aidd-cli/issues/41)) ([a4f43e0](https://github.com/ai-driven-dev/aidd-cli/commit/a4f43e09fca85fca21b77ed303e7ad2ebadb2738))

## [2.9.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.8.0...v2.9.0) (2026-03-17)


### Features

* **mcp:** platform-aware MCP config transform for Windows ([bb70aa3](https://github.com/ai-driven-dev/aidd-cli/commit/bb70aa336e60987cb8ca065726451f497223f551))


### Bug Fixes

* **lint:** fix Biome v2 worktree path exclusion and unused imports ([9e88227](https://github.com/ai-driven-dev/aidd-cli/commit/9e8822706bfaac5efa9cd8f29a68451e672c98bb))


### Documentation

* **tasks:** add implementation plan for MCP platform adaptation ([5777685](https://github.com/ai-driven-dev/aidd-cli/commit/57776856d77cec36db70e79875feef0da3bf6d41))


### Refactoring

* **distribution:** inject Platform port, delegate transform ownership to domain models ([302d35b](https://github.com/ai-driven-dev/aidd-cli/commit/302d35b5c2f7a577181201994b1afa00cd001868))

## [2.8.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.7.3...v2.8.0) (2026-03-17)


### Features

* **rules:** add and refine coding rules across all categories ([38c6f9a](https://github.com/ai-driven-dev/aidd-cli/commit/38c6f9aec3de5e5c0c64430980dd4b543fba432a))


### Documentation

* improve manual testing scenarios in CONTRIBUTING.md ([9339bcb](https://github.com/ai-driven-dev/aidd-cli/commit/9339bcb77a467febe671889bc644abf96856747d))
* improve manual testing scenarios in CONTRIBUTING.md ([f2d6db1](https://github.com/ai-driven-dev/aidd-cli/commit/f2d6db12b0875cfb13ceeaa143c1e6bbe1e14451)), closes [#12](https://github.com/ai-driven-dev/aidd-cli/issues/12)
* **memory:** add opencode tool and update version to v2.7.3 ([97b4671](https://github.com/ai-driven-dev/aidd-cli/commit/97b4671fa6c50111f30556348942948efc62ef52))


### Refactoring

* **use-cases:** convert writeCatalog function to CatalogUseCase class ([18fd0de](https://github.com/ai-driven-dev/aidd-cli/commit/18fd0de4cca288d9db0d73d68e63d75c060a383f))

## [2.7.3](https://github.com/ai-driven-dev/aidd-cli/compare/v2.7.2...v2.7.3) (2026-03-16)


### Bug Fixes

* **cli:** make self-update PM-agnostic and notify on CLI version outdated ([1984a54](https://github.com/ai-driven-dev/aidd-cli/commit/1984a54778e7778dff3f87ccd3476dd3d7c8116c))

## [2.7.2](https://github.com/ai-driven-dev/aidd-cli/compare/v2.7.1...v2.7.2) (2026-03-16)


### Bug Fixes

* **opencode:** use remote type instead of sse for url-based MCP servers ([#34](https://github.com/ai-driven-dev/aidd-cli/issues/34)) ([5e4d97c](https://github.com/ai-driven-dev/aidd-cli/commit/5e4d97c4577c6a2e9d97dd81418abc579b8d2700))

## [2.7.1](https://github.com/ai-driven-dev/aidd-cli/compare/v2.7.0...v2.7.1) (2026-03-16)


### Bug Fixes

* **resolver:** surface HTTP cause and auth hint on tag lookup failure ([c069d13](https://github.com/ai-driven-dev/aidd-cli/commit/c069d135668f3d35cee182ac621962a56150e647))
* **resolver:** surface HTTP cause and auth hint on tag lookup failure ([28bf567](https://github.com/ai-driven-dev/aidd-cli/commit/28bf567961dbe7a01eecf016358eea914c627c92)), closes [#25](https://github.com/ai-driven-dev/aidd-cli/issues/25)

## [2.7.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.6.0...v2.7.0) (2026-03-16)


### Features

* **install:** add OpenCode plugin support ([#24](https://github.com/ai-driven-dev/aidd-cli/issues/24)) ([a48c61c](https://github.com/ai-driven-dev/aidd-cli/commit/a48c61c28da1c557b0c6ccc5f180dade34e04184))

## [2.6.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.5.0...v2.6.0) (2026-03-13)


### Features

* **cli:** add aidd self-update command ([2b42a03](https://github.com/ai-driven-dev/aidd-cli/commit/2b42a0361a0d967f06b87437569fd83787e64289))
* **cli:** add aidd self-update command ([92d7765](https://github.com/ai-driven-dev/aidd-cli/commit/92d7765c4ab092cc04a9d11199c8b6f7269eea88))
* **self-update:** add self-update command with clean architecture ([f5fecb3](https://github.com/ai-driven-dev/aidd-cli/commit/f5fecb3083708455487e416a518409509c932c5a))


### Refactoring

* **self-update:** apply clean architecture ([2694e8d](https://github.com/ai-driven-dev/aidd-cli/commit/2694e8d191b7bcf8737d45eefa5d4f4b4e22039b))
* **self-update:** extract use case, fix pkg path, clean tests ([1232408](https://github.com/ai-driven-dev/aidd-cli/commit/12324089754162e23255c5b13054376b49952760))
* **self-update:** read version from bundled package.json import ([3d54ce5](https://github.com/ai-driven-dev/aidd-cli/commit/3d54ce552fa1a70f45cea3bb9e85708c84e8aaa3))

## [2.5.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.4.2...v2.5.0) (2026-03-11)


### Features

* **adopt:** resolve framework at adoption to classify framework vs user files ([88fcce3](https://github.com/ai-driven-dev/aidd-cli/commit/88fcce32b5f01f45e73b7dc4a575c178cd94cfbe))


### Bug Fixes

* **update:** prevent stale merge-file hash in manifest after update ([270dbb3](https://github.com/ai-driven-dev/aidd-cli/commit/270dbb3bc8ac5b40602f2c4554fe9370233132b9))


### Documentation

* **memory:** update memory documentation to reflect current behavior ([bdac76b](https://github.com/ai-driven-dev/aidd-cli/commit/bdac76bc395f115710499adb659c59ed42dc3a4f))

## [2.4.2](https://github.com/ai-driven-dev/aidd-cli/compare/v2.4.1...v2.4.2) (2026-03-11)


### Documentation

* **memory:** update package version and test count in documentation ([4e79dec](https://github.com/ai-driven-dev/aidd-cli/commit/4e79dece8727b76c687d736ec51744d8f426f494))
* remove manual TOC in favor of GitHub native TOC ([5929cfb](https://github.com/ai-driven-dev/aidd-cli/commit/5929cfb0089bf8f5a20a55b6aee326e750dd96ee))
* restructure README and rewrite CONTRIBUTING ([37fec2b](https://github.com/ai-driven-dev/aidd-cli/commit/37fec2bee0b2aebc48911fa38c09e1c8a516d1f2))
* restructure README for first-time user clarity ([4eec873](https://github.com/ai-driven-dev/aidd-cli/commit/4eec87368ab30ed96c39398279509fe4b3017965))

## [2.4.1](https://github.com/ai-driven-dev/aidd-cli/compare/v2.4.0...v2.4.1) (2026-03-11)


### Bug Fixes

* **ci:** exclude package.json from biome formatter to avoid release-please conflicts ([0435abd](https://github.com/ai-driven-dev/aidd-cli/commit/0435abdc60b7a84bb0617779c24cc7c5f764677a))

## [2.4.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.3.0...v2.4.0) (2026-03-11)


### Features

* display ASCII banner when aidd is run without arguments ([d3b7f24](https://github.com/ai-driven-dev/aidd-cli/commit/d3b7f24dfed2900ccbb5aa6cea40c32ad7962d02))
* merge ascii banner from worktree ([0170bee](https://github.com/ai-driven-dev/aidd-cli/commit/0170bee3cf9ca669be83a6ae8137431706c48d5e))


### Performance

* **tests:** parallelize e2e tests within files to halve total runtime ([48a0fad](https://github.com/ai-driven-dev/aidd-cli/commit/48a0fadca6afc070021fa12fa8a0c47f53419643))


### Refactoring

* **sync:** remove framework loading — use manifest frameworkPath as canonical key ([6bba237](https://github.com/ai-driven-dev/aidd-cli/commit/6bba2373feab15e38a96358a0378a0909e5b7a16))

## [2.3.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.2.0...v2.3.0) (2026-03-11)


### Features

* **adopt:** add adopt command for manual installation migration ([b34bc6b](https://github.com/ai-driven-dev/aidd-cli/commit/b34bc6b5361ecdce9652a4d6f2ba28f994d24c40))
* **cli:** add update, restore, sync, cache, config and doctor-fix commands ([095c311](https://github.com/ai-driven-dev/aidd-cli/commit/095c311eca47086619485ac9ee58cd901dfe7117))
* **sync:** add docs distribution and cross-tool bidirectional format conversion ([2f04dba](https://github.com/ai-driven-dev/aidd-cli/commit/2f04dba5e3c0bca4b0610aa2d5233d063c44eaba))


### Documentation

* **readme:** clarify AIDD_TOKEN requires repo scope not read:packages ([327b91d](https://github.com/ai-driven-dev/aidd-cli/commit/327b91d36564f90030d5babd56d90d0047032830))
* update memory, backlog and task files for M6-M9 ([1d7444e](https://github.com/ai-driven-dev/aidd-cli/commit/1d7444ec1b41a6c11b8596b6bda73881dc601b50))
* update README, CONTRIBUTING and memory for M9 milestone ([f77c5be](https://github.com/ai-driven-dev/aidd-cli/commit/f77c5be96c7b236f041b2316b26963299157027b))

## [2.2.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.1.0...v2.2.0) (2026-03-10)


### Features

* **pkg:** publish under @ai-driven-dev/cli ([0b082a4](https://github.com/ai-driven-dev/aidd-cli/commit/0b082a4d669a93e7dd1f3a31c8a2be4e919d8dda))

## [2.1.0](https://github.com/ai-driven-dev/aidd-cli/compare/v2.0.1...v2.1.0) (2026-03-09)


### Features

* **cli:** show contextual update banner on all commands ([6f8b5da](https://github.com/ai-driven-dev/aidd-cli/commit/6f8b5da984d5796ca1f5689e62c9ec09c1f52627))


### Bug Fixes

* **cli:** mention correct recovery commands in init re-init error ([0e56255](https://github.com/ai-driven-dev/aidd-cli/commit/0e5625507c8ac69200c6890ee360ae2e648165e8))

## [2.0.1](https://github.com/ai-driven-dev/aidd-cli/compare/aidd-cli-v2.0.0...aidd-cli-v2.0.1) (2026-03-09)


### Bug Fixes

* **ci:** remove duplicate pnpm version in release workflow ([ed79154](https://github.com/ai-driven-dev/aidd-cli/commit/ed79154e68a610661b75c7f4dc1f156a5682b53c))

## [2.0.0](https://github.com/ai-driven-dev/aidd-cli/compare/aidd-cli-v1.9.6...aidd-cli-v2.0.0) (2026-03-09)


### ⚠ BREAKING CHANGES

* CLI rebuilt from scratch; prior configurations are not compatible.

### Features

* add lefthook child-to-parent delegation + auto-install ([2e7cd87](https://github.com/ai-driven-dev/aidd-cli/commit/2e7cd87165da8646538bf3d420f526f50ecaae51))
* **catalog:** add catalog generation use case ([3949d88](https://github.com/ai-driven-dev/aidd-cli/commit/3949d88964a2263afded5e78373a7f9882f3a3bd))
* initial migration of AIDD CLI from monorepo ([1c67878](https://github.com/ai-driven-dev/aidd-cli/commit/1c67878402e3de17673e8ce3d0c0153c95e7aaa7))
* **m0:** migrate to 4-layer clean architecture skeleton ([2648039](https://github.com/ai-driven-dev/aidd-cli/commit/2648039c6ec51a92330d8fe81ec64444a0981cb3))
* **m1:** implement domain layer (tickets 010–016) ([25a376c](https://github.com/ai-driven-dev/aidd-cli/commit/25a376cf04e660db26da1cd08926ccc4a013d701))
* **m2:** implement infrastructure layer — HTTP, tar, cache, adapters ([ec862dc](https://github.com/ai-driven-dev/aidd-cli/commit/ec862dccbcc6a0570be0d4bd2699c71e0a1a9ee4))
* **m3:** implement init & install commands — CLI entry point, use cases, E2E tests ([5f89025](https://github.com/ai-driven-dev/aidd-cli/commit/5f89025e957ff92be3cd88b68564898beda2ba6f))
* **m4:** add clean, doctor, status, and uninstall commands and use cases ([bfd3a4f](https://github.com/ai-driven-dev/aidd-cli/commit/bfd3a4f0f47f50b825e1d5a8869da42268392a3c))
* relaunch as v2 — full architecture rewrite (M0–M5) ([5563d66](https://github.com/ai-driven-dev/aidd-cli/commit/5563d669a6c3f8cde993957f23046c28deb89fc8))


### Bug Fixes

* remove malicious payload ([b1799be](https://github.com/ai-driven-dev/aidd-cli/commit/b1799befa76251ea30fd3edcb08b196be880b468))
* replace cross-repo relative links with full GitHub URLs ([10b18cd](https://github.com/ai-driven-dev/aidd-cli/commit/10b18cd05d8ff2341dc46b6871de70598a43d1e2))
* restore CONTRIBUTING.md removed during repo migration ([30b0e7e](https://github.com/ai-driven-dev/aidd-cli/commit/30b0e7e5f462fd89120b5e0608e492ebecf3b7b5))
* update README to indicate CLI is outdated and improve formatting ([e90c180](https://github.com/ai-driven-dev/aidd-cli/commit/e90c18040b029b983ef72ef8eb5d10a32b9b278a))
