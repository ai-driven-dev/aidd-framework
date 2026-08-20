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
- A use-case serving requests in a long-lived process may catch to keep serving, and warns
  through the logger
