# Reference: Manifest Aggregate Root

## Role

- Tracks every installed framework file with its MD5 hash
- Persisted at `.aidd/manifest.json`
- Single source of truth for installed state — version guard reads v6 only on load, refusing an
  older manifest by naming the last CLI able to migrate it forward, and a newer one by naming
  self-update

## Write guard (applies to any use-case writing framework files)

- Before writing any framework file: check `fs.fileExists(path)` AND `!manifest.isFileTracked(relativePath)`
- If both true → skip the write, emit `logger.warn()`, never add it to the manifest
- Never overwrite a user-owned file

## Saving

- Installing files: save through `PostInstallPipelineUseCase`, which also updates `.gitignore` — see `references/post-install-pipeline.md`
- Changing only the manifest (plugin add/remove, marketplace sync, restore): `manifestRepo.save()` directly

## Merge file tracking

- Merge config files are tracked in `ToolEntry.mergeFiles` (not in `files`)
- `isFileTracked()` checks both `files` and `mergeFiles`
- Uninstall and clean must delete merge files alongside regular files

## Delegation to its members

`manifest.ts` is the aggregate root and entry point; it delegates tracked files, merge files, MCP
exclusions, and plugins to the sibling modules in `domain/manifest/`. Add a new tracked concept
as its own module there, exposed through the aggregate root — never by growing `manifest.ts`
itself with a new field it manages directly.
