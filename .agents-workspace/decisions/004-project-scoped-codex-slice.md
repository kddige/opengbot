# ADR 004: Project-scoped Codex desktop slice

**Status:** Accepted
**Date:** 2026-08-28

## Decision

The first useful desktop slice is one persistent root bot per explicitly opened
project, backed by the host's official Codex CLI login.

- Electron main grants project roots through the native directory picker.
- The backend canonicalizes the root, derives stable project/session/thread
  identities, and persists the active selection under Electron `userData`.
- Renderer chat uses TanStack AI `useChat` and its client persistence adapter.
- The embedded transport carries native TanStack stream chunks inside a small,
  versioned OpenGBot envelope containing project, integration, session, thread,
  run, request, and sequence identities.
- Codex runs through TanStack's Codex adapter and sandbox middleware with the
  exact project as its working root, `workspace-write`, approvals disabled,
  network disabled, no extra directories, and API-key environment variables
  scrubbed so host login remains the credential owner.

The local-process sandbox is labeled `trusted_host`. It scopes process working
directory and lifecycle but is not claimed as strong containment.

## Why

This proves the product thesis with the smallest end-to-end feature: project
identity remains visible while a subscription-backed harness streams a real
conversation. It also keeps embedded and future remote backends on the same
domain contract without translating TanStack AI events into a parallel chat
protocol.

## Consequences

- Project selection survives desktop restarts. Completed transcripts currently
  survive locally through TanStack's browser persistence adapter.
- Server-authoritative conversation persistence, multi-device history, durable
  mid-run reconnect, remote project grants, and strong outer isolation remain
  follow-up work.
- The Codex model defaults to `gpt-5.6-sol` for the verified host and is
  configurable with `OPENGBOT_CODEX_MODEL`; package autocomplete lists are not
  treated as account compatibility guarantees.
- CI uses a deterministic Codex-shaped runner through the real Electron and
  MessagePort path. Live provider login is not required by the test suite.
