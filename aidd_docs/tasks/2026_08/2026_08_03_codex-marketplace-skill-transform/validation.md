# Native Codex installation validation

Observed on 2026-08-03 from a locally built marketplace artifact:

```json
{
  "marketplaceName": "aidd-framework",
  "installedRoot": "/private/tmp/aidd-codex-marketplace.EOuI9t/marketplace",
  "alreadyAdded": false
}
```

Installed plugin identity:

```json
{
  "pluginId": "aidd-context@aidd-framework",
  "installedPath": "/tmp/aidd-codex-marketplace.EOuI9t/home/.codex/plugins/cache/aidd-framework/aidd-context/2.5.0",
  "source": {
    "source": "local",
    "path": "/private/tmp/aidd-codex-marketplace.EOuI9t/marketplace/plugins/aidd-context"
  },
  "marketplaceSource": {
    "sourceType": "local",
    "source": "/private/tmp/aidd-codex-marketplace.EOuI9t/marketplace"
  }
}
```

`sourceType: "local"` and the temporary artifact path prove this is not the upstream
`ai-driven-dev/framework` marketplace. The installed cache contained 13 `SKILL.md` files;
the completed `^model:` scan returned no matches.
