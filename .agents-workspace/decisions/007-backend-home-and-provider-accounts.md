# ADR 007: Backend home and provider-owned account registry

**Status:** Accepted
**Date:** 2026-08-29

## Context

OpenGBot needs provider/account/model selection that behaves identically in the
embedded utility and remote daemon. Current project metadata is under Electron
`userData`, there is one implicit Codex host account, and secrets/account
ownership are not yet modeled. ADR 003 already delegates CLI authentication to
the provider process.

## Decision

Each backend machine has an OpenGBot application home at `~/.opengbot`,
overridable by `OPENGBOT_HOME`. It contains owner-only backend metadata, logs,
cache, and runtime locks. Electron-only window preferences may remain under
Electron `userData`. Secrets never live in the application home.

OpenGBot persists a backend-local provider account registry and per-project
provider/account/model selection. Account metadata records:

- provider and account identity;
- backend identity/location;
- credential kind (`host_cli_login`, `api_key`, or documented
  `browser_oauth`);
- credential owner (`provider_cli` or `opengbot_keychain`);
- safe availability/version/probe metadata;
- opaque `secretRef` only when OpenGBot owns the credential.

Codex and Grok Build are first. Both may use the pinned native TanStack adapter
in `host` mode after the user logs in with the official CLI on the backend
machine. OpenGBot stores no copy of CLI tokens. Both may use API-key mode with
an OpenGBot-owned secret in the host OS keychain/secret service. OpenGBot-owned
browser/device OAuth is disabled until a provider documents a third-party flow.
A CLI login that launches a browser is still provider-owned `host_cli_login`.

The first registry implementation is a runtime-validated, schema-versioned,
atomic metadata file under the application home. It is intentionally small and
single-writer locked. A later forward migration moves it into the shared SQL
store alongside server-authoritative TanStack persistence.

## Consequences

- Embedded and remote account selections refer to accounts on their respective
  backend machine; desktop CLI login never authenticates a remote daemon.
- UI always shows backend, provider, account mode/owner, and selected model.
- Model catalogs are capability hints, not proof of account entitlement.
- API-key entry/import uses a backend-local secret broker or administration
  command, never an ordinary renderer-visible control payload.
- OpenGBot must not read Codex/Grok/Hermes token files, browser cookies, or copy
  provider CLI keychain entries.
- The application-home metadata format has explicit versioning, atomic writes,
  backup-before-migration, and a process ownership lock.

## Rejected options

- **Treat all credentials as OAuth:** API keys, CLI sessions, and app-owned OAuth
  have different owners, billing, refresh, and risk.
- **Copy provider CLI credentials into OpenGBot:** creates two refresh owners and
  relies on private file formats/endpoints.
- **Store backend state only in Electron `userData`:** cannot provide daemon
  parity and conflates desktop presentation with backend identity.
- **Require SQL before account selection:** couples a small, immediately useful
  slice to cross-runtime SQLite driver and packaging work.
