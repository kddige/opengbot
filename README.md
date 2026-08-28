# OpenGBot

OpenGBot is a desktop-first, open-source environment for project-scoped AI bots.
It is designed to combine multiple model providers and external harnesses behind
one clear experience without collapsing their distinct capabilities.

The desktop app will work in two modes:

- **Local:** the client and backend ship together as one desktop application.
- **Remote:** the same client connects securely to a backend on another machine.

The first multi-provider slice is working: choose a project with the native
desktop picker, select Codex or Grok and an advertised model, and stream a
project-scoped conversation through TanStack AI. OpenGBot detects the official
provider CLIs and can launch their browser sign-in flows from the execution
context menu. The provider CLI remains the credential owner; tokens never enter
the renderer or OpenGBot's metadata store. Architecture, research, and quality
decisions live in [`.agents-workspace`](.agents-workspace/README.md).

The embedded backend runs Codex or Grok as a trusted host process with the
selected project as its working and write root. Tool network access is disabled;
provider inference still uses the network. This is an explicit capability
boundary, not strong read containment; stronger isolation and the remote backend
transport are upcoming work.

Backend-owned metadata lives under `~/.opengbot` by default, or
`OPENGBOT_HOME` when explicitly configured:

```text
~/.opengbot/
  state/registry.v1.json
  logs/
  cache/
  run/
```

The directories and registry are owner-only, registry writes are atomic, and a
backend process lock prevents concurrent writers. Provider OAuth credentials do
not live there.

## Toolchain

- Electron and React
- TypeScript and Bun workspaces
- TanStack AI
- shadcn/ui
- oxlint and oxfmt

## Development

Electron Forge packaging currently requires Node 24; Bun remains the package
manager and script runner.

```sh
bun install
bun run dev
```

Run the complete quality gate before committing:

```sh
bun run verify
bun run build
```

`verify` includes formatting, linting, type checks, tests, and a real Electron
smoke flow covering the embedded backend handshake, native project grant, and a
streamed chat completion.
