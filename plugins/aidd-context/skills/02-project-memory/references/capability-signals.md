# Capability signals

A concern scan detects from a concrete fact in the repo, or an equivalent one, never inferred from the domain.

| Capability   | Means                          | Detected when                                                                             |
| ------------ | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `core`       | always                         | always                                                                                    |
| `backlog`    | organizes planned work         | local backlog artifacts, issue templates, or a repo file naming backlog conventions       |
| `ui`         | renders a user interface       | a web frontend framework (not React Native), or a `components/` or `pages/` dir           |
| `api`        | exposes HTTP or RPC            | a server framework, or a `routes/`, `controllers/`, or `api/` dir                         |
| `database`   | persists data                  | an ORM or driver, a `migrations/` dir, or a schema file                                    |
| `auth`       | authenticates or authorizes    | an auth library (passport, next-auth, clerk, auth0, devise), auth middleware, or an auth module |
| `realtime`   | pushes live updates            | a websocket or SSE library (socket.io, ws, pusher, ably)                                   |
| `messaging`  | async messages                 | a queue or broker (kafka, rabbitmq, sqs, bullmq) with producers or consumers               |
| `deployment` | is built and shipped           | a CI config, or a `Dockerfile`                                                             |
| `infra`      | infrastructure as code         | Terraform, Pulumi, Kubernetes, or Helm files                                               |
| `mobile`     | ships a mobile app             | an `ios/` or `android/` dir, a `pubspec.yaml`, a `Podfile`, or React Native or Flutter      |
| `desktop`    | ships a desktop app            | Electron or Tauri                                                                          |
| `package`    | ships a reusable library       | an importable entry (`main`, `module`, `exports`) that is not the CLI bin, and publishable  |
| `cli`        | runs as a command-line tool    | a `bin` field, or a CLI parser (commander, yargs, oclif, clap, click)                       |
| `data`       | processes data or trains models | notebooks, a data-versioning or ML tool, or pipeline and model files                       |
