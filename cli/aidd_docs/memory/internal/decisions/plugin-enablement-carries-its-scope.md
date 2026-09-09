# Plugin enablement carries its own scope

Read when touching `NativePluginActivator`, `plugin remove` or `clean`'s uninstall.

- `NativePluginActivator.enablePlugin`/`uninstallPlugin` take an optional `MarketplaceScope`, default `"project"`.
- Separate from a registration's own `scope` (always `"user"` for the shared source).
- Decides `--scope local` (claude, project-bound) or `--scope user` (machine-wide).
- Before: no scope argument, so every claude enablement landed at its implicit `user` default whatever scope `aidd` ran at.
- A tool without `scopeArgs` (codex, copilot) is unaffected.
- `clean` and `plugin remove` resolve the scope to uninstall from the host's registry first (`HostPluginRegistryReader`, `contexts/tools/domain/ports/host-plugin-registry-reader.ts`).
- Fallback when the registry is silent: the manifest's recorded scope, then the other (`resolve-uninstall-scope.ts`).
- Measured against the real `claude`: a mismatched-scope uninstall is refused, never silently missed.
