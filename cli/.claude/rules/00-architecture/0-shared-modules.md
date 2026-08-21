---
paths:
  - "src/application/**/*.ts"
---

# Shared Modules

When a module earns the right to be shared.

- Sharing needs two calling areas
- One caller means move it down
- Count callers before promoting
- Never create a shared folder upfront
- Promoted modules follow use-case rules

```sh
grep -rl <module> src   # the test is mechanical
```
