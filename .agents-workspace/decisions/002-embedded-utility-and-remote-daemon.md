# ADR 002: Embedded utility process and remote daemon

**Status:** Accepted
**Date:** 2026-08-28

## Decision

OpenGBot has one backend contract with two deployment modes:

- Embedded mode runs the TypeScript backend in an Electron utility process and
  connects through a private `MessagePort`.
- Remote mode runs the same backend capabilities in a Bun daemon and will
  connect through an authenticated, encrypted transport.

The Electron renderer never owns backend capabilities or receives unrestricted
Electron IPC. Project, actor, provider, model, and backend identity remain
visible product concepts in both modes.

## Why

This preserves a single-desktop experience without coupling the backend to the
renderer. It also provides a natural process boundary for crashes, cancellation,
and future sandbox supervision while keeping the remote deployment path honest.

## Consequences

- Shared runtime-validated protocol types live in `@opengbot/protocol`.
- Embedded and remote implementations must pass the same contract tests.
- Remote authentication and transport are required before remote execution is
  exposed to users.
