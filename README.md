# OpenGBot

OpenGBot is a desktop-first, open-source environment for project-scoped AI bots.
It is designed to combine multiple model providers and external harnesses behind
one clear experience without collapsing their distinct capabilities.

The desktop app will work in two modes:

- **Local:** the client and backend ship together as one desktop application.
- **Remote:** the same client connects securely to a backend on another machine.

The project is greenfield and currently in its foundation phase. Architecture,
research, and quality decisions live in [`.agents-workspace`](.agents-workspace/README.md).

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
bun run verify
```
