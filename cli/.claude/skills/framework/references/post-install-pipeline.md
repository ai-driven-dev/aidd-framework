# Reference: Post-Install Pipeline, Shared Use-Cases, Capability Sub-Use-Cases

## Post-install pipeline

**Rule**: a use case that installs framework files ends with `PostInstallPipelineUseCase`,
never with its steps inline. A use case that only changes the manifest saves it directly.

**Steps, in order**: `manifestRepo.save()`, then `GitignoreUseCase.execute()` with
`.aidd/cache/`, every installed tool's machine-local files, and `aidd_docs/runs/`.

```typescript
import { PostInstallPipelineUseCase } from "../install/post-install-pipeline-use-case.js";

await new PostInstallPipelineUseCase(this.manifestRepo, this.gitignoreUseCase).execute({
  projectRoot: options.projectRoot,
  manifest: options.manifest,
});
```

The source is `install/post-install-pipeline-use-case.ts`; read it before citing a step.

## Shared use-cases

Location: `application/shared/`. Rules:

- Never called from commands — only from other use-cases.
- Same class shape as a top-level use-case: single `execute()`, typed `*Options` in, typed
  `*Result` out.
- Create one only when the same orchestration logic is needed by ≥2 top-level use-cases — do not
  inline equivalent logic in each caller instead. `ensure-built-marketplace-use-case.ts` is the
  canonical example: both `plugin install` and `framework update` materialize a tool's build from
  the same per-target cache.

## Capability sub-use-cases

**Pattern**: an orchestrator guards capability presence before dispatching to a sub-use-case that
receives a narrowed type.

```typescript
if ("agents" in caps) {
  const result = await new InstallAgentsUseCase(/* ... */).execute({
    config: toolConfig as AiTool<HasAgents>,
  });
}
```

- Check `"name" in caps` before dispatching — skip tools that lack the capability.
- Never access `caps.agents` without first confirming presence via the guard.
- The sub-use-case receives pre-filtered, pre-typed input — never a raw `ToolConfig` or
  unnarrowed union — and returns `InstallationFile[]` or a typed result, no side effects beyond
  what it's explicitly asked to do.
- Sub-use-cases live in subdirectories of the parent feature: `install/`, and the equivalent
  update/uninstall directories.

These five files — `install-agents-use-case.ts` with its `commands`/`rules`/`skills`
siblings, and `install-content-section-use-case.ts`, the engine they hand a descriptor to, all
under `install/content/` — are the one place `framework` reaches directly into a `tools`
capability class instead of through a module `tools` has declared public. The exact five pairs
are listed in that test's baseline; there is no `hooks` sibling. `context-boundary.arch.test.ts` tracks this as a
shrinking baseline, not a pattern — it resolves once `install/` moves fully under an
application layer inside the `tools` context, which has not happened yet. Do not add a sixth
file to that list.
