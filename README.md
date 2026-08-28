# OpenGBot

OpenGBot is a desktop-first, open-source environment for project-scoped AI bots.
It is designed to combine multiple model providers and external harnesses behind
one clear experience without collapsing their distinct capabilities.

The desktop app will work in two modes:

- **Local:** the client and backend ship together as one desktop application.
- **Remote:** the same client connects securely to a backend on another machine.

The first vertical slice is working: choose a project with the native desktop
picker, use the host's existing Codex ChatGPT login, and stream a project-scoped
conversation through TanStack AI. Architecture, research, and quality decisions
live in [`.agents-workspace`](.agents-workspace/README.md).

The embedded backend runs Codex as a trusted host process with the selected
project as its working and write root and network access disabled. This is an
explicit capability boundary, not strong read containment; stronger isolation
and the remote backend transport are upcoming work.

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
