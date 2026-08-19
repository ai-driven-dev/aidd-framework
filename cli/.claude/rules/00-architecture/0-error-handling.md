---
paths:
  - "src/**/*.ts"
---

# Error Handling

- Use-cases and adapters throw, no try/catch inside them
- Adapters translate raw errors to typed domain exceptions before throwing
- Adapters may try/catch only to convert third-party errors to typed exceptions
- Commands catch at action level only via `errorHandler.handle(error)`
- No silent errors, every failure surfaces to the user
- One carve-out, for a use-case that handles a request inside a long-lived process rather
  than one CLI invocation: it may catch to keep serving, and must then warn through the
  logger. The rules above assume a failure can end the command; a server has nothing to
  end. Today this covers only `ReceiveTelemetryUseCase`'s retention prune, where losing a
  payload to a housekeeping error is the outcome the catch exists to prevent.
