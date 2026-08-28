# ADR 006: Separate control RPC from native AI streaming

**Status:** Accepted
**Date:** 2026-08-29

## Context

The embedded desktop slice has a secure utility-process boundary, but its
hand-written control correlation, chat dispatch, run registry, and lifecycle
logic live in Electron entry files. The Bun daemon implements only handshake,
so it does not exercise the working backend path. ADR 001 requires native
TanStack AI contracts; ADR 002 requires embedded and remote parity.

## Decision

OpenGBot will build one transport-independent `BackendHost` used by the Electron
utility process and Bun daemon. It owns the control router, authorized chat
handler, active-run registry, lifecycle, and health. Deployment apps supply only
transport, authentication/capability context, platform configuration, and
process supervision.

The two logical protocol planes are:

1. **Control:** oRPC v2 contracts with Zod inputs/outputs and typed public errors.
   Embedded uses oRPC's MessagePort handler/link; remote uses the same router
   through its Fetch/Hono handler over authenticated HTTPS.
2. **AI streaming:** native TanStack `RunAgentInput`, `StreamChunk`, AG-UI,
   persistence, interrupts, and cancellation. Embedded carries native chunks
   through a small MessagePort connection adapter. Remote uses TanStack's HTTPS
   SSE helpers (`toServerSentEventsResponse` and `fetchServerSentEvents`).

Control contracts live in `@opengbot/protocol`; the router and host live in a
new `@opengbot/backend-host` package. OpenGBot does not wrap native TanStack AI
types in an oRPC stream or a generic AI abstraction.

Electron preload owns a mode-neutral client and exposes individual allowlisted
methods and a TanStack chat connection through `contextBridge`. It does not
expose raw oRPC, `MessagePort`, `ipcRenderer`, or credentials. Privileged project
and secret operations use a separate host/admin context unavailable to the
renderer.

WebSocket is deferred. It becomes appropriate only if idle server push,
presence, or persistent multiplexed subscriptions become a product requirement.

## Consequences

- Utility and daemon must pass the same control and chat conformance tests.
- The daemon cannot advertise remote readiness until it implements authenticated
  control and chat parity.
- Hand-written control request maps and catch-all error responses are removed
  after oRPC migration; chat remains on native TanStack transport contracts.
- Cancellation and graceful drain terminate the same shared run registry in
  both deployments.
- oRPC is a control-plane dependency, not a replacement for TanStack AI.

## Rejected options

- **Keep custom RPC:** duplicates schema, correlation, middleware, error, and
  transport work already provided by oRPC.
- **Use WebSocket for everything:** adds connection recovery, heartbeat,
  backpressure, and multiplexing complexity before a persistent-push need exists.
- **Run embedded backend over localhost HTTP:** expands listener and
  authentication surface without improving the desktop deployment.
- **Put provider execution in Electron main:** couples window lifecycle to agent
  failures and violates the accepted utility boundary.
